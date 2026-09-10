import * as vscode from 'vscode';
import { readConfig, type ChromutaConfig } from '../config.js';
import { log } from '../logging.js';
import type { ScanCache } from './cache.js';
import { matchesAnyGlob } from './glob.js';
import type { ColorIndex } from './index.js';
import { scanContent } from './scanner.js';

/** Typing produces a change event per keystroke; only the settled text is worth scanning. */
const DOCUMENT_DEBOUNCE_MS = 300;

/**
 * Keep the index current without rescanning the workspace.
 *
 * Three sources of change are handled: edits in an open editor, which rescan that one
 * document from memory; filesystem events, which cover external edits, creates and
 * deletes; and configuration changes that alter what counts as a color, which
 * invalidate everything because every score could differ.
 */
export function createWatcher(
  index: ColorIndex,
  cache: ScanCache,
  onInvalidated: () => void
): vscode.Disposable {
  const disposables: vscode.Disposable[] = [];
  const pending = new Map<string, ReturnType<typeof setTimeout>>();

  let config = readConfig();
  let watcher = createFileWatcher(config);

  const rescanDocument = (document: vscode.TextDocument): void => {
    if (!shouldTrack(document.uri, config)) return;
    const matches = scanContent(document.uri, document.getText(), config, document.languageId);
    index.set(document.uri, matches);
    // Disk and memory now disagree, so the cached entry would be wrong on next scan.
    cache.invalidate(document.uri);
    index.notifyChanged();
  };

  disposables.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.contentChanges.length === 0) return;

      const key = event.document.uri.toString();
      const existing = pending.get(key);
      if (existing) clearTimeout(existing);

      pending.set(
        key,
        setTimeout(() => {
          pending.delete(key);
          rescanDocument(event.document);
        }, DOCUMENT_DEBOUNCE_MS)
      );
    }),

    vscode.workspace.onDidCloseTextDocument((document) => {
      // Unsaved edits are gone; the file on disk is the truth again.
      const timer = pending.get(document.uri.toString());
      if (timer) {
        clearTimeout(timer);
        pending.delete(document.uri.toString());
      }
    }),

    vscode.workspace.onDidChangeConfiguration((event) => {
      const affectsDetection =
        event.affectsConfiguration('chromuta.include') ||
        event.affectsConfiguration('chromuta.exclude') ||
        event.affectsConfiguration('chromuta.namedColors.enabled') ||
        event.affectsConfiguration('chromuta.maxFiles');

      config = readConfig();

      if (!affectsDetection) return;

      log('watcher: detection settings changed, invalidating the index');
      watcher.dispose();
      watcher = createFileWatcher(config);
      index.clear();
      cache.clear();
      index.notifyChanged();
      onInvalidated();
    })
  );

  function createFileWatcher(current: ChromutaConfig): vscode.Disposable {
    const fsWatcher = vscode.workspace.createFileSystemWatcher(current.include);

    const handleWrite = async (uri: vscode.Uri): Promise<void> => {
      if (!shouldTrack(uri, config)) return;
      cache.invalidate(uri);
      try {
        const bytes = await vscode.workspace.fs.readFile(uri);
        index.set(uri, scanContent(uri, new TextDecoder().decode(bytes), config));
        index.notifyChanged();
      } catch {
        // Written then removed before we read it. Nothing to index.
        index.delete(uri);
        index.notifyChanged();
      }
    };

    fsWatcher.onDidCreate((uri) => void handleWrite(uri));
    fsWatcher.onDidChange((uri) => void handleWrite(uri));
    fsWatcher.onDidDelete((uri) => {
      cache.invalidate(uri);
      index.delete(uri);
      index.notifyChanged();
    });

    return fsWatcher;
  }

  return new vscode.Disposable(() => {
    for (const timer of pending.values()) clearTimeout(timer);
    pending.clear();
    watcher.dispose();
    for (const d of disposables) d.dispose();
  });
}

/**
 * Only track files the scan itself would have read. Otherwise editing an untitled
 * buffer or a settings JSON would inject entries the workspace scan never produces.
 */
function shouldTrack(uri: vscode.Uri, config: ChromutaConfig): boolean {
  if (uri.scheme !== 'file') return false;
  const relative = vscode.workspace.asRelativePath(uri, false);
  if (relative === uri.fsPath) return false; // outside every workspace folder
  return !matchesAnyGlob(relative, config.exclude);
}
