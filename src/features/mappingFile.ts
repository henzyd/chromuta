import * as vscode from 'vscode';
import { parseMapping, type ParsedMapping } from '../core/remap/schema.js';
import { readConfig } from '../config.js';

export interface LoadedMapping {
  readonly uri: vscode.Uri;
  readonly text: string;
  readonly parsed: ParsedMapping;
}

/**
 * Where the mapping file lives: the configured name inside the first workspace folder.
 *
 * A multi-root workspace gets one mapping in the first folder rather than one per
 * folder, because a palette swap is a property of the product, not of a directory.
 */
export function mappingUri(): vscode.Uri | undefined {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) return undefined;
  return vscode.Uri.joinPath(folder.uri, readConfig().mappingFile);
}

export function isMappingFile(uri: vscode.Uri): boolean {
  const expected = mappingUri();
  return expected !== undefined && expected.toString() === uri.toString();
}

/** Read and validate the mapping file, or undefined when it does not exist. */
export async function loadMapping(): Promise<LoadedMapping | undefined> {
  const uri = mappingUri();
  if (!uri) return undefined;

  // An open editor may hold unsaved edits, which are what the user means.
  const open = vscode.workspace.textDocuments.find(
    (doc) => doc.uri.toString() === uri.toString()
  );

  let text: string;
  if (open) {
    text = open.getText();
  } else {
    try {
      text = new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));
    } catch {
      return undefined;
    }
  }

  return { uri, text, parsed: parseMapping(text) };
}

export async function writeMapping(uri: vscode.Uri, text: string): Promise<void> {
  await vscode.workspace.fs.writeFile(uri, Buffer.from(text, 'utf8'));
}
