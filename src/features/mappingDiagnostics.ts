import * as vscode from 'vscode';
import { parseMapping } from '../core/remap/schema.js';
import { isMappingFile, mappingUri } from './mappingFile.js';

/**
 * Publish mapping validation problems as diagnostics on the mapping file.
 *
 * A bad rule is a mistake in a specific place in a specific file, so it belongs as a
 * squiggle on that value rather than in a notification the user has to correlate back
 * to a line by hand.
 */
export function registerMappingDiagnostics(): vscode.Disposable {
  const diagnostics = vscode.languages.createDiagnosticCollection('chromuta');

  const validate = (document: vscode.TextDocument): void => {
    if (!isMappingFile(document.uri)) return;

    const { problems } = parseMapping(document.getText());

    diagnostics.set(
      document.uri,
      problems.map((problem) => {
        const range = new vscode.Range(
          document.positionAt(problem.offset),
          document.positionAt(problem.offset + problem.length)
        );
        const diagnostic = new vscode.Diagnostic(
          range,
          problem.message,
          problem.severity === 'error'
            ? vscode.DiagnosticSeverity.Error
            : vscode.DiagnosticSeverity.Warning
        );
        diagnostic.source = 'Chromuta';
        return diagnostic;
      })
    );
  };

  for (const document of vscode.workspace.textDocuments) validate(document);

  const disposables = [
    diagnostics,
    vscode.workspace.onDidOpenTextDocument(validate),
    vscode.workspace.onDidChangeTextDocument((event) => validate(event.document)),
    vscode.workspace.onDidCloseTextDocument((document) => {
      if (isMappingFile(document.uri)) diagnostics.delete(document.uri);
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      // A renamed mapping file means the old diagnostics belong to nothing.
      if (event.affectsConfiguration('chromuta.mappingFile')) {
        diagnostics.clear();
        for (const document of vscode.workspace.textDocuments) validate(document);
      }
    })
  ];

  return new vscode.Disposable(() => {
    for (const d of disposables) d.dispose();
  });
}

/** Open the mapping file so the user can see the diagnostics in place. */
export async function revealMappingFile(): Promise<void> {
  const uri = mappingUri();
  if (!uri) return;
  const document = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(document);
}
