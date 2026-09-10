import * as vscode from 'vscode';
import { colorKey } from '../../core/color/distance.js';
import { formatAny, isLossyAny, notationLabel } from '../../core/notation.js';
import { ALL_OUTPUT_NOTATIONS, type AnyOutputNotation } from '../../core/color/types.js';
import { readConfig } from '../../config.js';
import { log } from '../../logging.js';
import type { ColorIndex, PaletteEntry } from '../../workspace/index.js';
import { scanContent } from '../../workspace/scanner.js';
import type { IndexedMatch } from '../../workspace/positions.js';
import { pickNotation } from './pickNotation.js';

/** Either a color key from a hover link or code action, or a tree node carrying the entry. */
export type ColorTarget = string | { readonly entry?: PaletteEntry };

interface FileOccurrences {
  readonly uri: vscode.Uri;
  readonly matches: readonly IndexedMatch[];
}

/**
 * Convert every occurrence of one color across the workspace.
 *
 * The affected files are re-read and re-scanned before any edit is built. Index
 * ranges are only as fresh as the last scan, and applying a stale range would
 * corrupt a file rather than merely miss it.
 */
export async function convertColorEverywhere(
  index: ColorIndex,
  target: ColorTarget | undefined
): Promise<void> {
  const config = readConfig();

  const key = resolveKey(target);
  if (!key) {
    void vscode.window.showInformationMessage('Chromuta: no color selected.');
    return;
  }

  const entry = index.find(key, config.confidenceThreshold);
  if (!entry) {
    void vscode.window.showInformationMessage(
      'Chromuta: that color is no longer in the index. Run a scan and try again.'
    );
    return;
  }

  // A color can appear in files of different dialects, so every writable notation is
  // on offer here rather than only the ones valid in the active editor.
  const choice = await pickNotation(
    entry.color,
    ALL_OUTPUT_NOTATIONS,
    config.format,
    `Convert ${entry.occurrences.length} occurrence(s) in ${entry.fileCount} file(s)`
  );
  if (!choice) return;

  const current = await collectCurrentOccurrences(entry, key, config);

  if (current.length === 0) {
    void vscode.window.showWarningMessage(
      'Chromuta: none of the indexed occurrences are still present. Run a scan and try again.'
    );
    return;
  }

  const lossy = isLossyAny(entry.color, choice.notation);
  if (lossy && !(await confirmLossy(choice.notation))) return;

  const { edit, count } = buildEdit(current, choice.notation, config);

  if (count === 0) {
    void vscode.window.showInformationMessage('Chromuta: every occurrence is already in that notation.');
    return;
  }

  // Every entry needs confirmation, which makes VS Code show its refactor preview
  // panel with a checkbox per edit. A cross-file rewrite should be reviewed first.
  const applied = await vscode.workspace.applyEdit(edit);

  if (!applied) {
    void vscode.window.showWarningMessage('Chromuta: the edit was not applied.');
    return;
  }

  void vscode.window.showInformationMessage(
    `Chromuta: converted ${count} occurrence(s) to ${notationLabel(choice.notation)}.`
  );
}

function resolveKey(target: ColorTarget | undefined): string | undefined {
  if (typeof target === 'string') return target;
  return target?.entry?.key;
}

/**
 * Re-scan each file the index says contains this color, and keep the matches that
 * still resolve to it. This is what makes the operation safe against edits made since
 * the last scan.
 */
async function collectCurrentOccurrences(
  entry: PaletteEntry,
  key: string,
  config: ReturnType<typeof readConfig>
): Promise<FileOccurrences[]> {
  const byFile = new Map<string, vscode.Uri>();
  for (const occurrence of entry.occurrences) {
    byFile.set(occurrence.uri.toString(), occurrence.uri);
  }

  const results: FileOccurrences[] = [];

  for (const uri of byFile.values()) {
    try {
      const document = vscode.workspace.textDocuments.find(
        (doc) => doc.uri.toString() === uri.toString()
      );

      const text = document
        ? document.getText()
        : new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));

      const matches = scanContent(uri, text, config, document?.languageId).filter(
        (match) => match.confidence >= config.confidenceThreshold && colorKey(match.color) === key
      );

      if (matches.length > 0) results.push({ uri, matches });
    } catch (error) {
      log(`convertEverywhere: skipped ${uri.fsPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return results;
}

function buildEdit(
  files: readonly FileOccurrences[],
  notation: AnyOutputNotation,
  config: ReturnType<typeof readConfig>
): { edit: vscode.WorkspaceEdit; count: number } {
  const edit = new vscode.WorkspaceEdit();
  let count = 0;

  for (const file of files) {
    const relative = vscode.workspace.asRelativePath(file.uri, false);

    for (const match of file.matches) {
      const text = formatAny(match.color, notation, config.format);
      if (text === null || text === match.text) continue;

      const range = new vscode.Range(
        match.startLine,
        match.startColumn,
        match.endLine,
        match.endColumn
      );

      edit.replace(file.uri, range, text, {
        needsConfirmation: true,
        label: `${match.text} → ${text}`,
        description: `${relative}:${match.startLine + 1}`
      });
      count++;
    }
  }

  return { edit, count };
}

async function confirmLossy(notation: string): Promise<boolean> {
  const answer = await vscode.window.showWarningMessage(
    `This color is outside the sRGB gamut and cannot be represented in ${notation}. ` +
      'Converting will reduce its chroma permanently.',
    { modal: true },
    'Convert anyway'
  );
  return answer === 'Convert anyway';
}

/** Copy a palette entry's value in the default notation. */
export async function copyColor(target: ColorTarget | undefined): Promise<void> {
  const config = readConfig();
  const entry = typeof target === 'object' ? target?.entry : undefined;
  if (!entry) return;

  const text =
    formatAny(entry.color, config.defaultNotation, config.format) ??
    formatAny(entry.color, 'hex', config.format);

  if (!text) return;

  await vscode.env.clipboard.writeText(text);
  void vscode.window.showInformationMessage(`Chromuta: copied ${text}`);
}
