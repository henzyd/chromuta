import * as vscode from 'vscode';
import type { FormatOptions } from '../core/color/types.js';
import { applyStyleProfile, inferStyle } from '../core/detect/style.js';
import { scanText } from '../core/detect/scanText.js';
import type { ColorMatch } from '../core/detect/types.js';
import type { ChromutaConfig } from '../config.js';

export interface DocumentScan {
  readonly matches: readonly ColorMatch[];
  /** Format options already adjusted to this file's observed conventions. */
  readonly formatOptions: FormatOptions;
}

/**
 * Scan one document and work out how new literals in it should be written.
 *
 * Style inference runs over the same matches that were just found, so a file with
 * forty uppercase hex values keeps producing uppercase hex regardless of the global
 * default.
 */
export function scanDocument(
  document: vscode.TextDocument,
  config: ChromutaConfig
): DocumentScan {
  const matches = scanText(document.getText(), {
    languageId: document.languageId,
    filePath: vscode.workspace.asRelativePath(document.uri, false),
    namedColors: config.namedColors
  });

  const formatOptions = config.inferStyleFromFile
    ? applyStyleProfile(config.format, inferStyle(matches), config.formatOverrides)
    : config.format;

  return { matches, formatOptions };
}

export function rangeOf(document: vscode.TextDocument, match: ColorMatch): vscode.Range {
  return new vscode.Range(document.positionAt(match.start), document.positionAt(match.end));
}
