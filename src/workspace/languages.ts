import * as path from 'path';

/**
 * Map a file extension to a VS Code language id.
 *
 * The workspace scan reads files without opening them, so there is no
 * `TextDocument.languageId` to consult. The confidence heuristics depend on knowing
 * whether a file is a stylesheet, so without this every named color in every `.css`
 * file would take the "outside a stylesheet" penalty.
 */
const BY_EXTENSION: Readonly<Record<string, string>> = {
  '.css': 'css',
  '.scss': 'scss',
  '.sass': 'sass',
  '.less': 'less',
  '.styl': 'stylus',
  '.pcss': 'postcss',
  '.postcss': 'postcss',
  '.html': 'html',
  '.htm': 'html',
  '.vue': 'vue',
  '.svelte': 'svelte',
  '.astro': 'astro',
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.jsx': 'javascriptreact',
  '.ts': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.tsx': 'typescriptreact',
  '.json': 'json',
  '.jsonc': 'jsonc',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.md': 'markdown',
  '.markdown': 'markdown',
  '.xml': 'xml',
  '.svg': 'xml'
};

export function languageIdForPath(filePath: string): string | undefined {
  return BY_EXTENSION[path.extname(filePath).toLowerCase()];
}
