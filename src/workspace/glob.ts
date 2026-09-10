/**
 * Minimal glob test for the exclude list during incremental updates.
 *
 * `findFiles` does the real matching during a full scan. This only has to catch the
 * common `**|/dir/**` and `**|/*.ext` shapes, so that a file saved inside
 * node_modules does not get indexed between scans.
 */
export function matchesGlob(relativePath: string, pattern: string): boolean {
  const normalized = relativePath.split('\\').join('/');
  return globToRegExp(pattern).test(normalized);
}

export function matchesAnyGlob(relativePath: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => matchesGlob(relativePath, pattern));
}

const cache = new Map<string, RegExp>();

function globToRegExp(pattern: string): RegExp {
  const cached = cache.get(pattern);
  if (cached) return cached;

  const source = pattern
    .split('\\').join('/')
    // Escape regex metacharacters, leaving the glob operators * ? / alone.
    .replace(/[.+^${}()|[\]]/g, '\\$&')
    // `**/` must be optional so `**/dist/**` also matches a top-level `dist/x`.
    .replace(/\*\*\//g, '\u0000')
    .replace(/\*\*/g, '\u0001')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .split('\u0000').join('(?:.*/)?')
    .split('\u0001').join('.*');

  const regex = new RegExp(`^${source}$`);
  cache.set(pattern, regex);
  return regex;
}
