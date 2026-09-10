import * as vscode from 'vscode';
import { colorProviderSelector, readConfig, SUPPORTED_LANGUAGES } from './config.js';
import { ChromutaCodeActionProvider } from './features/codeActions.js';
import { ChromutaColorProvider } from './features/documentColor.js';
import { ChromutaHoverProvider } from './features/hover.js';
import { registerMappingDiagnostics, revealMappingFile } from './features/mappingDiagnostics.js';
import { registerPaletteView } from './features/paletteTree.js';
import { SwatchProvider } from './features/swatches.js';
import { convertColorEverywhere, copyColor, type ColorTarget } from './features/commands/convertColorEverywhere.js';
import { applyRemap } from './features/commands/applyRemap.js';
import { convertDocument } from './features/commands/convertDocument.js';
import { convertSelection } from './features/commands/convertSelection.js';
import { extractMapping } from './features/commands/extractMapping.js';
import { clearIndex, runWorkspaceScan } from './features/commands/scanWorkspace.js';
import { initLogging, log, logError } from './logging.js';
import { ScanCache } from './workspace/cache.js';
import { ColorIndex } from './workspace/index.js';
import { createWatcher } from './workspace/watcher.js';

/** Re-registered when its language filter changes, since a selector is fixed at registration. */
let colorProviderRegistration: vscode.Disposable | undefined;

export function activate(context: vscode.ExtensionContext): void {
  initLogging(context);

  const config = readConfig();
  const index = new ColorIndex();
  const cache = new ScanCache(context.workspaceState, config.cacheEnabled);
  const swatches = new SwatchProvider(vscode.Uri.joinPath(context.globalStorageUri, 'swatches'));

  context.subscriptions.push(index);

  const palette = registerPaletteView(index, swatches);
  context.subscriptions.push(...palette.disposables);

  registerColorProvider(context);

  const selector = SUPPORTED_LANGUAGES.map((language) => ({ language, scheme: 'file' as const }));

  context.subscriptions.push(
    vscode.languages.registerHoverProvider(selector, new ChromutaHoverProvider(index)),

    vscode.languages.registerCodeActionsProvider(selector, new ChromutaCodeActionProvider(index), {
      providedCodeActionKinds: ChromutaCodeActionProvider.providedCodeActionKinds
    }),

    // The index is intentionally not populated here. A cold scan of a large repository
    // is the one slow operation, and doing it during activation would delay startup
    // for every window.
    createWatcher(index, cache, () => palette.provider.refresh()),

    // Validation problems belong on the mapping file itself, so they are visible
    // where the mistake was made rather than in a notification.
    registerMappingDiagnostics(),

    vscode.commands.registerCommand('chromuta.convertSelection', () =>
      run('convertSelection', convertSelection)
    ),
    vscode.commands.registerCommand('chromuta.convertDocument', () =>
      run('convertDocument', convertDocument)
    ),
    vscode.commands.registerCommand('chromuta.scanWorkspace', () =>
      run('scanWorkspace', () => runWorkspaceScan(index, cache))
    ),
    vscode.commands.registerCommand('chromuta.clearIndex', () =>
      run('clearIndex', () => clearIndex(index, cache))
    ),
    vscode.commands.registerCommand('chromuta.refreshPalette', () => {
      palette.provider.refresh();
    }),
    vscode.commands.registerCommand('chromuta.convertColorEverywhere', (target?: ColorTarget) =>
      run('convertColorEverywhere', () => convertColorEverywhere(index, target))
    ),
    vscode.commands.registerCommand('chromuta.copyColor', (target?: ColorTarget) =>
      run('copyColor', () => copyColor(target))
    ),
    vscode.commands.registerCommand('chromuta.applyRemap', () =>
      run('applyRemap', () => applyRemap(index, cache))
    ),
    vscode.commands.registerCommand('chromuta.extractMapping', () =>
      run('extractMapping', () => extractMapping(index, cache))
    ),
    vscode.commands.registerCommand('chromuta.openMapping', () =>
      run('openMapping', revealMappingFile)
    ),

    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('chromuta.documentColor.excludeLanguages')) {
        registerColorProvider(context);
      }
      if (event.affectsConfiguration('chromuta.confidenceThreshold')) {
        // The threshold decides which group a color falls into, so the view is stale.
        palette.provider.refresh();
      }
    }),

    vscode.window.onDidChangeActiveTextEditor(updateLanguageContext),

    new vscode.Disposable(() => colorProviderRegistration?.dispose())
  );

  updateLanguageContext(vscode.window.activeTextEditor);
  log('Chromuta activated');
}

export function deactivate(): void {
  colorProviderRegistration?.dispose();
  colorProviderRegistration = undefined;
}

function registerColorProvider(context: vscode.ExtensionContext): void {
  colorProviderRegistration?.dispose();
  colorProviderRegistration = vscode.languages.registerColorProvider(
    colorProviderSelector(readConfig()),
    new ChromutaColorProvider()
  );
  context.subscriptions.push(colorProviderRegistration);
}

/** Gates the editor context menu item, so it does not appear in unrelated files. */
function updateLanguageContext(editor: vscode.TextEditor | undefined): void {
  const supported = editor !== undefined && SUPPORTED_LANGUAGES.includes(editor.document.languageId);
  void vscode.commands.executeCommand('setContext', 'chromuta.supportedLanguage', supported);
}

/** Commands must not let an exception surface as an unhandled rejection. */
async function run(name: string, action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (error) {
    logError(name, error);
    void vscode.window.showErrorMessage(
      `Chromuta: ${name} failed. See the Chromuta output channel for details.`
    );
  }
}
