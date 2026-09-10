import * as vscode from 'vscode';
import { formatColor, isLossyConversion } from '../../core/color/format.js';
import type { ColorMatch } from '../../core/detect/types.js';
import { readConfig } from '../../config.js';
import { rangeOf, scanDocument } from '../documentScan.js';
import { pickNotation } from './pickNotation.js';

/** Convert every confident color in the active file to one notation. */
export async function convertDocument(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    void vscode.window.showInformationMessage('Chromuta: no active editor.');
    return;
  }

  const document = editor.document;
  const config = readConfig(document.uri);
  const { matches, formatOptions } = scanDocument(document, config);

  const confident = matches.filter((m) => m.confidence >= config.confidenceThreshold);
  const skipped = matches.length - confident.length;

  if (confident.length === 0) {
    void vscode.window.showInformationMessage(
      skipped > 0
        ? `Chromuta: ${skipped} possible colors found, all below the confidence threshold.`
        : 'Chromuta: no colors found in this file.'
    );
    return;
  }

  const choice = await pickNotation(
    confident[0]!.color,
    config.notations,
    formatOptions,
    `Convert ${confident.length} colors in ${document.fileName.split(/[/\\]/).pop()}`
  );
  if (!choice) return;

  const lossy = confident.filter((m) => isLossyConversion(m.color, choice.notation));
  if (lossy.length > 0 && !(await confirmLossy(lossy, choice.notation))) return;

  const edit = new vscode.WorkspaceEdit();
  let converted = 0;

  for (const match of confident) {
    const text = formatColor(match.color, choice.notation, formatOptions);
    if (text === null || text === match.text) continue;
    edit.replace(document.uri, rangeOf(document, match), text);
    converted++;
  }

  if (converted === 0) {
    void vscode.window.showInformationMessage('Chromuta: every color is already in that notation.');
    return;
  }

  await vscode.workspace.applyEdit(edit);

  const note = skipped > 0 ? ` ${skipped} low-confidence match(es) left untouched.` : '';
  void vscode.window.showInformationMessage(`Chromuta: converted ${converted} color(s).${note}`);
}

/**
 * Converting a wide-gamut color into an sRGB-bound notation reduces chroma and
 * cannot be undone by converting back. That is worth a prompt rather than a
 * silent edit.
 */
async function confirmLossy(lossy: readonly ColorMatch[], notation: string): Promise<boolean> {
  const answer = await vscode.window.showWarningMessage(
    `${lossy.length} color(s) sit outside the sRGB gamut and cannot be represented in ${notation}. Converting will reduce their chroma permanently.`,
    { modal: true },
    'Convert anyway'
  );
  return answer === 'Convert anyway';
}
