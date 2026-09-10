import * as vscode from 'vscode';
import { formatAny, notationsForMatch } from '../../core/notation.js';
import { matchAtOffset } from '../../core/detect/scanText.js';
import { readConfig } from '../../config.js';
import { dialectContextFor, rangeOf, scanDocument } from '../documentScan.js';
import { pickNotation } from './pickNotation.js';

/** Convert the single color under the cursor, or every color inside a selection. */
export async function convertSelection(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    void vscode.window.showInformationMessage('Chromuta: no active editor.');
    return;
  }

  const config = readConfig(editor.document.uri);
  const { matches, formatOptions } = scanDocument(editor.document, config);

  if (matches.length === 0) {
    void vscode.window.showInformationMessage('Chromuta: no color found in this file.');
    return;
  }

  const selection = editor.selection;
  const start = editor.document.offsetAt(selection.start);
  const end = editor.document.offsetAt(selection.end);

  const targets = selection.isEmpty
    ? [matchAtOffset(matches, start)].filter((m) => m !== undefined)
    : matches.filter((m) => m.end > start && m.start < end);

  if (targets.length === 0) {
    void vscode.window.showInformationMessage(
      selection.isEmpty
        ? 'Chromuta: no color under the cursor.'
        : 'Chromuta: no color in the selection.'
    );
    return;
  }

  // The preview in the picker is built from the first target, which is the only one
  // when the selection is empty.
  const choice = await pickNotation(
    targets[0]!.color,
    notationsForMatch(
      targets[0]!.notation,
      dialectContextFor(editor.document),
      config.dialects,
      config.notations
    ),
    formatOptions,
    targets.length === 1 ? 'Convert color' : `Convert ${targets.length} colors`
  );
  if (!choice) return;

  const edit = new vscode.WorkspaceEdit();
  let converted = 0;

  for (const match of targets) {
    const text = formatAny(match.color, choice.notation, formatOptions);
    if (text === null || text === match.text) continue;
    edit.replace(editor.document.uri, rangeOf(editor.document, match), text);
    converted++;
  }

  if (converted === 0) {
    void vscode.window.showInformationMessage('Chromuta: already in that notation.');
    return;
  }

  await vscode.workspace.applyEdit(edit);
}
