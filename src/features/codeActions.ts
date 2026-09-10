import * as vscode from 'vscode';
import { colorKey } from '../core/color/distance.js';
import { formatAny, notationLabel, notationsForMatch } from '../core/notation.js';
import type { AnyOutputNotation, FormatOptions } from '../core/color/types.js';
import type { ColorMatch } from '../core/detect/types.js';
import { readConfig } from '../config.js';
import type { ColorIndex } from '../workspace/index.js';
import { dialectContextFor, rangeOf, scanDocument } from './documentScan.js';

/**
 * Quick fixes on the color under the cursor: convert this one, convert every
 * occurrence in this file, or convert every occurrence in the workspace.
 *
 * The single-color and single-file actions carry their edits directly, so they apply
 * without a command round-trip. The workspace action defers to a command because it
 * has to re-read the affected files first.
 */
export class ChromutaCodeActionProvider implements vscode.CodeActionProvider {
  static readonly providedCodeActionKinds = [vscode.CodeActionKind.RefactorRewrite];

  constructor(private readonly index: ColorIndex) {}

  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    _context: vscode.CodeActionContext,
    token: vscode.CancellationToken
  ): vscode.CodeAction[] {
    if (token.isCancellationRequested) return [];

    const config = readConfig(document.uri);
    const { matches, formatOptions } = scanDocument(document, config);

    const offset = document.offsetAt(range.start);
    const match = matches.find((m) => offset >= m.start && offset <= m.end);
    if (!match) return [];

    const actions: vscode.CodeAction[] = [];
    const key = colorKey(match.color);

    const notations = notationsForMatch(
      match.notation,
      dialectContextFor(document),
      config.dialects,
      config.notations
    );

    for (const notation of notations) {
      if (notation === match.notation) continue;

      const text = formatAny(match.color, notation, formatOptions);
      if (text === null || text === match.text) continue;

      actions.push(singleEdit(document, match, text, `Convert to ${text}`));

      const sameColor = matches.filter(
        (m) => colorKey(m.color) === key && m.confidence >= config.confidenceThreshold
      );
      if (sameColor.length > 1) {
        actions.push(
          multiEdit(
            document,
            sameColor,
            notation,
            formatOptions,
            `Convert all ${sameColor.length} in this file to ${notationLabel(notation)}`
          )
        );
      }
    }

    const entry = this.index.find(key, config.confidenceThreshold);
    if (entry && entry.fileCount > 1) {
      const action = new vscode.CodeAction(
        `Convert all ${entry.occurrences.length} across the workspace…`,
        vscode.CodeActionKind.RefactorRewrite
      );
      action.command = {
        command: 'chromuta.convertColorEverywhere',
        title: 'Convert across the workspace',
        arguments: [key]
      };
      actions.push(action);
    }

    return actions;
  }
}

function singleEdit(
  document: vscode.TextDocument,
  match: ColorMatch,
  text: string,
  title: string
): vscode.CodeAction {
  const action = new vscode.CodeAction(title, vscode.CodeActionKind.RefactorRewrite);
  action.edit = new vscode.WorkspaceEdit();
  action.edit.replace(document.uri, rangeOf(document, match), text);
  return action;
}

function multiEdit(
  document: vscode.TextDocument,
  matches: readonly ColorMatch[],
  notation: AnyOutputNotation,
  options: FormatOptions,
  title: string
): vscode.CodeAction {
  const action = new vscode.CodeAction(title, vscode.CodeActionKind.RefactorRewrite);
  action.edit = new vscode.WorkspaceEdit();

  for (const match of matches) {
    const text = formatAny(match.color, notation, options);
    if (text === null || text === match.text) continue;
    action.edit.replace(document.uri, rangeOf(document, match), text);
  }

  return action;
}
