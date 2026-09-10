import * as vscode from 'vscode';

let channel: vscode.OutputChannel | undefined;

export function initLogging(context: vscode.ExtensionContext): void {
  channel = vscode.window.createOutputChannel('Chromuta');
  context.subscriptions.push(channel);
}

export function log(message: string): void {
  channel?.appendLine(`[${new Date().toISOString()}] ${message}`);
}

export function logError(message: string, error: unknown): void {
  const detail = error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error);
  log(`ERROR ${message}: ${detail}`);
}
