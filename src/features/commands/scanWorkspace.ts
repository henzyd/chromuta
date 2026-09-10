import * as vscode from 'vscode';
import { readConfig } from '../../config.js';
import type { ScanCache } from '../../workspace/cache.js';
import type { ColorIndex } from '../../workspace/index.js';
import { scanWorkspace } from '../../workspace/scanner.js';

/** Run a full workspace scan behind a cancellable progress notification. */
export async function runWorkspaceScan(index: ColorIndex, cache: ScanCache): Promise<void> {
  if (!vscode.workspace.workspaceFolders?.length) {
    void vscode.window.showInformationMessage('Chromuta: open a folder to scan for colors.');
    return;
  }

  const config = readConfig();

  const result = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Chromuta: scanning for colors',
      cancellable: true
    },
    (progress, token) => scanWorkspace(index, cache, config, token, progress)
  );

  if (result.cancelled) {
    void vscode.window.showInformationMessage(
      `Chromuta: scan cancelled after ${result.matchCount} color(s).`
    );
    return;
  }

  const stats = index.stats(config.confidenceThreshold);
  const cached = result.filesFromCache > 0 ? `, ${result.filesFromCache} from cache` : '';
  const capped =
    result.filesFound >= config.maxFiles
      ? ` Stopped at the ${config.maxFiles}-file limit; raise chromuta.maxFiles to scan more.`
      : '';

  void vscode.window.showInformationMessage(
    `Chromuta: ${stats.colorCount} distinct color(s), ${result.matchCount} use(s) ` +
      `in ${result.filesWithColors} file(s). Read ${result.filesFound} file(s) in ` +
      `${(result.elapsedMs / 1000).toFixed(1)}s${cached}.${capped}`
  );
}

export async function clearIndex(index: ColorIndex, cache: ScanCache): Promise<void> {
  index.clear();
  cache.clear();
  await cache.flush();
  index.notifyChanged();
  void vscode.window.showInformationMessage('Chromuta: color index cleared.');
}
