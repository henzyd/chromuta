import * as vscode from 'vscode';
import { applyStyleProfile, inferStyle } from '../../core/detect/style.js';
import { buildPlan, describePlan, type ChangePlan, type PlanInput } from '../../core/remap/plan.js';
import { compileMapping } from '../../core/remap/resolve.js';
import { readConfig, type ChromutaConfig } from '../../config.js';
import { log } from '../../logging.js';
import type { ScanCache } from '../../workspace/cache.js';
import { matchesAnyGlob } from '../../workspace/glob.js';
import type { ColorIndex } from '../../workspace/index.js';
import type { IndexedMatch } from '../../workspace/positions.js';
import { scanContent } from '../../workspace/scanner.js';
import { loadMapping } from '../mappingFile.js';
import { revealMappingFile } from '../mappingDiagnostics.js';
import { extractMapping } from './extractMapping.js';
import { runWorkspaceScan } from './scanWorkspace.js';

/**
 * Apply the mapping file across the workspace.
 *
 * The pipeline is load, validate, re-read, resolve, plan, preview, apply. Re-reading
 * matters: index positions are only as fresh as the last scan, and applying a stale
 * range would corrupt a file rather than merely miss it.
 */
export async function applyRemap(index: ColorIndex, cache: ScanCache): Promise<void> {
  const config = readConfig();

  const loaded = await loadMapping();
  if (!loaded) {
    await offerToCreate(index, cache);
    return;
  }

  const fatal = loaded.parsed.problems.filter((p) => p.severity === 'error');
  if (fatal.length > 0 || !loaded.parsed.mapping) {
    const answer = await vscode.window.showErrorMessage(
      `Chromuta: ${config.mappingFile} has ${fatal.length} error(s) and cannot be applied.`,
      'Open mapping file'
    );
    if (answer === 'Open mapping file') await revealMappingFile();
    return;
  }

  if (index.isEmpty) {
    const answer = await vscode.window.showInformationMessage(
      'Chromuta: the workspace has not been scanned yet, so there is nothing to remap.',
      'Scan now'
    );
    if (answer !== 'Scan now') return;
    await runWorkspaceScan(index, cache);
    if (index.isEmpty) return;
  }

  const mapping = compileMapping(loaded.parsed.mapping);

  const planned = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Chromuta: planning palette changes',
      cancellable: true
    },
    (progress, token) => buildPlanFromWorkspace(index, mapping, config, token, progress)
  );

  if (!planned) return;
  const { plan, uris } = planned;

  reportPlan(plan, loaded.parsed.mapping.rules.map((r) => `${r.from} → ${r.to}`));

  if (plan.editCount === 0) {
    void vscode.window.showInformationMessage(`Chromuta: nothing to change. ${describePlan(plan)}`);
    if (plan.ambiguities.length > 0) await offerAmbiguityReport(plan);
    return;
  }

  if (!(await confirmPlan(plan))) return;

  const edit = buildWorkspaceEdit(plan, uris);

  // Every entry needs confirmation, which makes VS Code open its refactor preview
  // with a checkbox per change. A cross-file palette swap should be reviewed first.
  const applied = await vscode.workspace.applyEdit(edit);

  if (!applied) {
    void vscode.window.showWarningMessage('Chromuta: the palette mapping was not applied.');
    return;
  }

  void vscode.window.showInformationMessage(
    `Chromuta: applied ${plan.editCount} replacement(s) across ${plan.fileCount} file(s).`
  );
}

// ---------------------------------------------------------------------------

interface PlanFile extends PlanInput<IndexedMatch> {
  readonly uri: vscode.Uri;
}

interface PlannedWorkspace {
  readonly plan: ChangePlan<IndexedMatch>;
  /** Relative path back to URI, so the plan itself stays editor-agnostic. */
  readonly uris: ReadonlyMap<string, vscode.Uri>;
}

async function buildPlanFromWorkspace(
  index: ColorIndex,
  mapping: ReturnType<typeof compileMapping>,
  config: ChromutaConfig,
  token: vscode.CancellationToken,
  progress: vscode.Progress<{ message?: string; increment?: number }>
): Promise<PlannedWorkspace | undefined> {
  const files = [...index.entries()];
  const inputs: PlanFile[] = [];

  for (let i = 0; i < files.length; i++) {
    if (token.isCancellationRequested) return undefined;

    const [uri] = files[i]!;
    const relative = vscode.workspace.asRelativePath(uri, false);

    if (matchesAnyGlob(relative, mapping.exclude)) {
      inputs.push({
        uri,
        path: relative,
        matches: index.byFile(uri),
        formatOptions: config.format,
        excluded: true
      });
      continue;
    }

    try {
      const open = vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString());
      const text = open
        ? open.getText()
        : new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));

      const matches = scanContent(uri, text, config, open?.languageId);
      const formatOptions = config.inferStyleFromFile
        ? applyStyleProfile(config.format, inferStyle(matches), config.formatOverrides)
        : config.format;

      inputs.push({ uri, path: relative, matches, formatOptions });
    } catch (error) {
      log(`applyRemap: skipped ${relative}: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (i % 25 === 0) {
      progress.report({ message: `${i} of ${files.length} files` });
      // Yield so cancellation and the UI get a turn.
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  const uris = new Map<string, vscode.Uri>();
  for (const input of inputs) uris.set(input.path, input.uri);

  return { plan: buildPlan(inputs, mapping, config.confidenceThreshold), uris };
}

function buildWorkspaceEdit(
  plan: ChangePlan<IndexedMatch>,
  uris: ReadonlyMap<string, vscode.Uri>
): vscode.WorkspaceEdit {
  const edit = new vscode.WorkspaceEdit();

  for (const file of plan.files) {
    const uri = uris.get(file.path);
    if (!uri) continue;

    for (const planned of file.edits) {
      const match = planned.match;
      const range = new vscode.Range(
        match.startLine,
        match.startColumn,
        match.endLine,
        match.endColumn
      );

      const approximate = planned.exact ? '' : ` (ΔE ${planned.distance.toFixed(3)})`;
      const clamped = planned.lossy ? ' [clamped to sRGB]' : '';

      edit.replace(uri, range, planned.to, {
        needsConfirmation: true,
        label: `${planned.from} → ${planned.to}${approximate}${clamped}`,
        description: `${file.path}:${match.startLine + 1}`
      });
    }
  }

  return edit;
}

async function confirmPlan(plan: ChangePlan<IndexedMatch>): Promise<boolean> {
  const warnings: string[] = [];
  if (plan.ambiguities.length > 0) {
    warnings.push(`${plan.ambiguities.length} color(s) matched more than one rule and will be left alone.`);
  }
  if (plan.lossyCount > 0) {
    warnings.push(`${plan.lossyCount} replacement(s) fall outside sRGB and will have their chroma reduced.`);
  }

  if (warnings.length === 0) return true;

  const answer = await vscode.window.showWarningMessage(
    `Chromuta: ${describePlan(plan)}.`,
    { modal: true, detail: warnings.join('\n\n') },
    'Continue to preview'
  );
  return answer === 'Continue to preview';
}

function reportPlan(plan: ChangePlan<IndexedMatch>, ruleLabels: readonly string[]): void {
  log(`remap: ${describePlan(plan)}`);

  for (const index of plan.unusedRules) {
    log(`remap: rule ${index} matched nothing (${ruleLabels[index] ?? 'unknown'})`);
  }

  for (const ambiguity of plan.ambiguities) {
    const candidates = ambiguity.candidates
      .map((c) => `${c.rule.raw.from} (ΔE ${c.distance.toFixed(4)})`)
      .join(', ');
    log(`remap: ambiguous ${ambiguity.match.text} in ${ambiguity.path}: ${candidates}`);
  }
}

async function offerAmbiguityReport(plan: ChangePlan<IndexedMatch>): Promise<void> {
  const answer = await vscode.window.showWarningMessage(
    `Chromuta: ${plan.ambiguities.length} color(s) matched more than one rule. ` +
      'Lower the tolerance or set "tolerance": 0 on the competing rules.',
    'Show details'
  );
  if (answer === 'Show details') {
    await vscode.commands.executeCommand('workbench.action.output.toggleOutput');
  }
}

async function offerToCreate(index: ColorIndex, cache: ScanCache): Promise<void> {
  const config = readConfig();
  const answer = await vscode.window.showInformationMessage(
    `Chromuta: no ${config.mappingFile} in this workspace.`,
    'Extract one from the workspace'
  );
  if (answer === 'Extract one from the workspace') {
    await extractMapping(index, cache);
  }
}
