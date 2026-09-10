import * as vscode from 'vscode';
import { colorProviderSelector, readConfig } from './config.js';
import { ChromutaColorProvider } from './features/documentColor.js';
import { convertDocument } from './features/commands/convertDocument.js';
import { convertSelection } from './features/commands/convertSelection.js';
import { initLogging, log, logError } from './logging.js';

/** Disposable for the color provider, re-registered when its language filter changes. */
let colorProviderRegistration: vscode.Disposable | undefined;

export function activate(context: vscode.ExtensionContext): void {
  initLogging(context);
  log('Chromuta activated');

  registerColorProvider(context);

  context.subscriptions.push(
    vscode.commands.registerCommand('chromuta.convertSelection', () =>
      run('convertSelection', convertSelection)
    ),
    vscode.commands.registerCommand('chromuta.convertDocument', () =>
      run('convertDocument', convertDocument)
    ),
    vscode.workspace.onDidChangeConfiguration((event) => {
      // The provider's language filter is fixed at registration time, so a change to
      // the exclusion list only takes effect if we register again.
      if (event.affectsConfiguration('chromuta.documentColor.excludeLanguages')) {
        registerColorProvider(context);
      }
    }),
    new vscode.Disposable(() => colorProviderRegistration?.dispose())
  );
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
