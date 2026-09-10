import * as vscode from 'vscode';
import { DEFAULT_FORMAT_OPTIONS, type FormatOptions, type OutputNotation } from './core/color/types.js';

/** Languages Chromuta scans and offers conversions in. */
export const SUPPORTED_LANGUAGES: readonly string[] = [
  'css', 'scss', 'less', 'sass', 'postcss', 'stylus',
  'html', 'vue', 'svelte', 'astro',
  'javascript', 'javascriptreact', 'typescript', 'typescriptreact',
  'json', 'jsonc', 'yaml', 'markdown', 'xml'
];

export interface ChromutaConfig {
  readonly defaultNotation: OutputNotation;
  readonly notations: readonly OutputNotation[];
  readonly namedColors: boolean;
  readonly confidenceThreshold: number;
  readonly inferStyleFromFile: boolean;
  readonly format: FormatOptions;
  /**
   * Format keys the user set explicitly. Per-file style inference fills only the
   * keys absent from this set, so an explicit setting always wins.
   */
  readonly formatOverrides: ReadonlySet<keyof FormatOptions>;
  readonly documentColorExcludeLanguages: readonly string[];
}

const FORMAT_KEYS: readonly (keyof FormatOptions)[] = [
  'hexCase', 'shorthandHex', 'functionSyntax', 'alphaStyle', 'precision', 'spaceAfterComma'
];

export function readConfig(scope?: vscode.Uri): ChromutaConfig {
  const cfg = vscode.workspace.getConfiguration('chromuta', scope ?? null);

  const format = { ...DEFAULT_FORMAT_OPTIONS };
  const overrides = new Set<keyof FormatOptions>();

  for (const key of FORMAT_KEYS) {
    const section = `format.${key}`;
    const value = cfg.get(section);
    if (value !== undefined) (format as Record<string, unknown>)[key] = value;
    if (isExplicitlySet(cfg, section)) overrides.add(key);
  }

  return {
    defaultNotation: cfg.get<OutputNotation>('defaultNotation', 'hex'),
    notations: cfg.get<OutputNotation[]>('notations', ['hex', 'rgb', 'hsl', 'oklch']),
    namedColors: cfg.get<boolean>('namedColors.enabled', true),
    confidenceThreshold: cfg.get<number>('confidenceThreshold', 0.5),
    inferStyleFromFile: cfg.get<boolean>('inferStyleFromFile', true),
    format,
    formatOverrides: overrides,
    documentColorExcludeLanguages: cfg.get<string[]>('documentColor.excludeLanguages', [
      'css', 'scss', 'less'
    ])
  };
}

/** True when a value comes from user, workspace, or folder settings rather than the schema default. */
function isExplicitlySet(cfg: vscode.WorkspaceConfiguration, section: string): boolean {
  const info = cfg.inspect(section);
  if (!info) return false;
  return (
    info.globalValue !== undefined ||
    info.workspaceValue !== undefined ||
    info.workspaceFolderValue !== undefined ||
    info.globalLanguageValue !== undefined ||
    info.workspaceLanguageValue !== undefined ||
    info.workspaceFolderLanguageValue !== undefined
  );
}

/** Language selector for the color provider, honoring the exclusion list. */
export function colorProviderSelector(config: ChromutaConfig): vscode.DocumentSelector {
  const excluded = new Set(config.documentColorExcludeLanguages);
  return SUPPORTED_LANGUAGES
    .filter((language) => !excluded.has(language))
    .map((language) => ({ language, scheme: 'file' as const }));
}
