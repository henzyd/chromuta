import * as vscode from 'vscode';
import { scanText } from '../core/detect/scanText.js';
import { buildExcludeGlob, type ChromutaConfig } from '../config.js';
import { log } from '../logging.js';
import type { ScanCache } from './cache.js';
import type { ColorIndex } from './index.js';
import { languageIdForPath } from './languages.js';
import { withPositions, type IndexedMatch } from './positions.js';

/** Files read between yields. Large enough to amortize, small enough to stay responsive. */
const BATCH_SIZE = 50;

export interface ScanResult {
  readonly filesFound: number;
  readonly filesScanned: number;
  readonly filesFromCache: number;
  readonly filesWithColors: number;
  readonly matchCount: number;
  readonly cancelled: boolean;
  readonly elapsedMs: number;
}

export type ScanProgress = vscode.Progress<{ message?: string; increment?: number }>;

/**
 * Scan every matching file in the workspace and populate the index.
 *
 * Work happens in batches with an await between them, so the extension host stays
 * responsive on a large repository, and the cancellation token is honored at every
 * batch boundary rather than only at the end.
 */
export async function scanWorkspace(
  index: ColorIndex,
  cache: ScanCache,
  config: ChromutaConfig,
  token: vscode.CancellationToken,
  progress?: ScanProgress
): Promise<ScanResult> {
  const started = Date.now();

  const exclude = buildExcludeGlob(config);
  const uris = await vscode.workspace.findFiles(config.include, exclude, config.maxFiles, token);

  log(`scan: ${uris.length} candidate file(s)`);

  let filesScanned = 0;
  let filesFromCache = 0;
  let filesWithColors = 0;
  let matchCount = 0;
  let cancelled = token.isCancellationRequested;

  index.clear();

  for (let offset = 0; offset < uris.length && !cancelled; offset += BATCH_SIZE) {
    const batch = uris.slice(offset, offset + BATCH_SIZE);

    // Reads within a batch overlap; batches are sequential so memory stays bounded.
    const results = await Promise.all(batch.map((uri) => scanFile(uri, cache, config)));

    for (const result of results) {
      if (!result) continue;
      if (result.fromCache) filesFromCache++;
      else filesScanned++;

      if (result.matches.length > 0) {
        index.set(result.uri, result.matches);
        filesWithColors++;
        matchCount += result.matches.length;
      }
    }

    progress?.report({
      message: `${Math.min(offset + BATCH_SIZE, uris.length)} of ${uris.length} files, ${matchCount} colors`,
      increment: (batch.length / Math.max(1, uris.length)) * 100
    });

    cancelled = token.isCancellationRequested;
  }

  await cache.flush();
  index.notifyChanged();

  const result: ScanResult = {
    filesFound: uris.length,
    filesScanned,
    filesFromCache,
    filesWithColors,
    matchCount,
    cancelled,
    elapsedMs: Date.now() - started
  };

  log(`scan: ${JSON.stringify(result)}`);
  return result;
}

interface FileResult {
  readonly uri: vscode.Uri;
  readonly matches: readonly IndexedMatch[];
  readonly fromCache: boolean;
}

async function scanFile(
  uri: vscode.Uri,
  cache: ScanCache,
  config: ChromutaConfig
): Promise<FileResult | undefined> {
  try {
    // An open document may hold unsaved edits, which are the truth for the user even
    // though the cache and the file on disk disagree.
    const open = findOpenDocument(uri);
    if (open) {
      return { uri, matches: scanContent(uri, open.getText(), config), fromCache: false };
    }

    const stat = await vscode.workspace.fs.stat(uri);

    const cached = cache.get(uri, stat);
    if (cached) return { uri, matches: cached, fromCache: true };

    const bytes = await vscode.workspace.fs.readFile(uri);
    const text = new TextDecoder().decode(bytes);
    const matches = scanContent(uri, text, config);

    cache.set(uri, stat, matches);
    return { uri, matches, fromCache: false };
  } catch (error) {
    // A file deleted mid-scan, or one we lack permission to read, is not worth
    // failing the whole scan over.
    log(`scan: skipped ${uri.fsPath}: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

export function scanContent(
  uri: vscode.Uri,
  text: string,
  config: ChromutaConfig,
  languageId?: string
): IndexedMatch[] {
  const matches = scanText(text, {
    languageId: languageId ?? languageIdForPath(uri.fsPath),
    filePath: vscode.workspace.asRelativePath(uri, false),
    namedColors: config.namedColors
  });
  return withPositions(matches, text);
}

function findOpenDocument(uri: vscode.Uri): vscode.TextDocument | undefined {
  const key = uri.toString();
  return vscode.workspace.textDocuments.find((doc) => doc.uri.toString() === key && doc.isDirty);
}
