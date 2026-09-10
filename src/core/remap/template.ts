import { DEFAULT_TOLERANCE, MAPPING_VERSION } from './schema.js';

export interface MappingTemplateEntry {
  /** The color as it will appear in `from`, already formatted. */
  readonly value: string;
  readonly occurrences: number;
  readonly files: number;
}

/**
 * Render a starter mapping file from the colors found in a workspace.
 *
 * Each rule maps a color to itself. That keeps the file valid the moment it is
 * written, makes applying it before editing a no-op rather than an error, and turns
 * "swap our palette" into "fill in this list", which is the difference between a
 * feature people use and one they do not.
 *
 * The tolerance is 0 rather than the usual default: an extracted mapping lists real
 * colors from the codebase, including near-identical shades, and approximate matching
 * across those would report ambiguities instead of doing the work.
 */
export function renderMappingTemplate(entries: readonly MappingTemplateEntry[]): string {
  const lines: string[] = [];

  lines.push('{');
  lines.push('  // Chromuta palette mapping.');
  lines.push('  //');
  lines.push('  // Every color found in the workspace is listed below, most-used first, mapped');
  lines.push('  // to itself. Change the "to" values to the colors you want, delete the rules');
  lines.push('  // you do not care about, then run "Chromuta: Apply Palette Mapping".');
  lines.push('  //');
  lines.push('  // "tolerance" is a perceptual distance in OKLab. 0 means only an exact match');
  lines.push('  // is rewritten. About 0.02 is a just-noticeable difference, and matching that');
  lines.push('  // loosely will also catch near-identical shades.');
  lines.push(`  "version": ${MAPPING_VERSION},`);
  lines.push('  "tolerance": 0,');
  lines.push('');
  lines.push('  // Uncomment to set the notation every replacement is written in. Without it,');
  lines.push('  // each replacement keeps the notation you wrote its "to" value in.');
  lines.push('  // "defaultNotation": "oklch",');
  lines.push('');
  lines.push('  "exclude": [');
  lines.push('    "**/__snapshots__/**",');
  lines.push('    "**/*.test.*",');
  lines.push('    "**/*.spec.*"');
  lines.push('  ],');
  lines.push('');

  if (entries.length === 0) {
    lines.push('  // No colors were found. Run "Chromuta: Scan Workspace for Colors" first.');
    lines.push('  "rules": []');
    lines.push('}');
    return lines.join('\n') + '\n';
  }

  lines.push('  "rules": [');

  // Pad after the comma, not before it, so short values do not produce `"x" ,`.
  const width = Math.max(...entries.map((entry) => JSON.stringify(entry.value).length)) + 1;

  entries.forEach((entry, i) => {
    const quoted = JSON.stringify(entry.value);
    const from = `${quoted},`.padEnd(width + 1);
    const comma = i === entries.length - 1 ? '' : ',';
    const uses = `${entry.occurrences} use${entry.occurrences === 1 ? '' : 's'}`;
    const files = `${entry.files} file${entry.files === 1 ? '' : 's'}`;
    lines.push(`    { "from": ${from}"to": ${quoted} }${comma} // ${uses} in ${files}`);
  });

  lines.push('  ]');
  lines.push('}');

  return lines.join('\n') + '\n';
}

/** A mapping file with no rules, for a workspace that has not been scanned. */
export function emptyMappingTemplate(): string {
  return renderMappingTemplate([]);
}

export { DEFAULT_TOLERANCE };
