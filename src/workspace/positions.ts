import type { ColorMatch } from '../core/detect/types.js';

/** A match with line and column resolved, so the palette view can reveal it without opening the file. */
export interface IndexedMatch extends ColorMatch {
  readonly startLine: number;
  readonly startColumn: number;
  readonly endLine: number;
  readonly endColumn: number;
}

/**
 * Attach line and column to each match in one pass over the text.
 *
 * The scan reads files it never opens as documents, so `positionAt` is unavailable.
 * Resolving positions at scan time also means the tree view can jump to an
 * occurrence without reading the file again.
 */
export function withPositions(matches: readonly ColorMatch[], text: string): IndexedMatch[] {
  if (matches.length === 0) return [];

  const lineStarts = computeLineStarts(text);

  return matches.map((match) => {
    const start = locate(lineStarts, match.start);
    const end = locate(lineStarts, match.end);
    return {
      ...match,
      startLine: start.line,
      startColumn: start.column,
      endLine: end.line,
      endColumn: end.column
    };
  });
}

function computeLineStarts(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) starts.push(i + 1);
  }
  return starts;
}

/** Binary search the line containing `offset`. */
function locate(lineStarts: readonly number[], offset: number): { line: number; column: number } {
  let lo = 0;
  let hi = lineStarts.length - 1;

  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lineStarts[mid]! <= offset) lo = mid;
    else hi = mid - 1;
  }

  return { line: lo, column: offset - lineStarts[lo]! };
}
