import * as vscode from 'vscode';
import type { FormatOptions } from '../core/color/types.js';
import { applyStyleProfile, inferStyle } from '../core/detect/style.js';
import { scanText } from '../core/detect/scanText.js';
import type { ColorMatch } from '../core/detect/types.js';
import type { DialectContext } from '../core/dialects/types.js';
import type { ChromutaConfig } from '../config.js';

/**
 * Cached scans, keyed by document URI and version.
 *
 * Three providers ask for the same scan of the same document: the color decorator,
 * the hover, and the code actions. On a large stylesheet that meant scanning the whole
 * file three times for one hover.
 */
const cache = new Map<string, { version: number; scan: DocumentScan }>();

/** Enough for the handful of editors a person has open at once. */
const CACHE_LIMIT = 12;

/** Scans depend on configuration, so a settings change has to drop them. */
export function clearDocumentScanCache(): void {
  cache.clear();
}

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
export function scanDocument(document: vscode.TextDocument, config: ChromutaConfig): DocumentScan {
  const key = document.uri.toString();
  const cached = cache.get(key);
  if (cached && cached.version === document.version) return cached.scan;

  const matches = scanText(document.getText(), {
    languageId: document.languageId,
    filePath: vscode.workspace.asRelativePath(document.uri, false),
    namedColors: config.namedColors,
    dialects: config.dialects
  });

  const formatOptions = config.inferStyleFromFile
    ? applyStyleProfile(config.format, inferStyle(matches), config.formatOverrides)
    : config.format;

  const scan: DocumentScan = { matches, formatOptions };

  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { version: document.version, scan });

  return scan;
}

export function rangeOf(document: vscode.TextDocument, match: ColorMatch): vscode.Range {
  return new vscode.Range(document.positionAt(match.start), document.positionAt(match.end));
}

/** What the dialect registry needs to decide which notations apply to a document. */
export function dialectContextFor(document: vscode.TextDocument): DialectContext {
  return {
    languageId: document.languageId,
    filePath: vscode.workspace.asRelativePath(document.uri, false)
  };
}
