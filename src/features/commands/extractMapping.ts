import * as vscode from 'vscode';
import { formatColor } from '../../core/color/format.js';
import { renderMappingTemplate, type MappingTemplateEntry } from '../../core/remap/template.js';
import { readConfig } from '../../config.js';
import type { ColorIndex } from '../../workspace/index.js';
import type { ScanCache } from '../../workspace/cache.js';
import { mappingUri, writeMapping } from '../mappingFile.js';
import { runWorkspaceScan } from './scanWorkspace.js';

/**
 * Write a starter mapping file listing every color in the workspace.
 *
 * Asking someone to author a palette mapping from scratch means asking them to first
 * find every hard-coded color by hand, which is the problem they installed this to
 * solve.
 */
export async function extractMapping(index: ColorIndex, cache: ScanCache): Promise<void> {
  const uri = mappingUri();
  if (!uri) {
    void vscode.window.showInformationMessage('Chromuta: open a folder before extracting a mapping.');
    return;
  }

  if (index.isEmpty && !(await offerScan(index, cache))) return;

  const config = readConfig();
  const { palette } = index.groups(config.confidenceThreshold);

  const entries: MappingTemplateEntry[] = [];
  for (const entry of palette) {
    const value =
      formatColor(entry.color, config.defaultNotation, config.format) ??
      formatColor(entry.color, 'hex', config.format);
    if (!value) continue;
    entries.push({ value, occurrences: entry.occurrences.length, files: entry.fileCount });
  }

  if (!(await confirmOverwrite(uri))) return;

  await writeMapping(uri, renderMappingTemplate(entries));

  const document = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(document);

  void vscode.window.showInformationMessage(
    `Chromuta: wrote ${entries.length} rule(s). Every color maps to itself, so change the ` +
      '"to" values, then run "Chromuta: Apply Palette Mapping".'
  );
}

async function offerScan(index: ColorIndex, cache: ScanCache): Promise<boolean> {
  const answer = await vscode.window.showInformationMessage(
    'Chromuta: the workspace has not been scanned yet, so there are no colors to extract.',
    'Scan now'
  );
  if (answer !== 'Scan now') return false;

  await runWorkspaceScan(index, cache);
  return !index.isEmpty;
}

/** Overwriting a mapping someone has edited would throw away real work. */
async function confirmOverwrite(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
  } catch {
    return true; // Does not exist yet.
  }

  const name = vscode.workspace.asRelativePath(uri, false);
  const answer = await vscode.window.showWarningMessage(
    `${name} already exists. Overwrite it? Any "to" values you have filled in will be lost.`,
    { modal: true },
    'Overwrite'
  );
  return answer === 'Overwrite';
}
