import type { CommentRanges } from './types.js';

interface Range {
  start: number;
  end: number;
}

/**
 * Approximate comment locations in one pass.
 *
 * This is deliberately syntax-agnostic rather than correct: it will treat a `//`
 * inside a string literal as the start of a comment. That is acceptable because
 * being inside a comment only costs a small confidence penalty, it never discards a
 * match outright.
 */
export function findCommentRanges(text: string): CommentRanges {
  const ranges: Range[] = [];

  collect(text, /\/\*[\s\S]*?\*\//g, ranges);
  collect(text, /<!--[\s\S]*?-->/g, ranges);
  // The lookbehind keeps the `//` in `https://` from opening a comment.
  collect(text, /(?<!:)\/\/[^\n]*/g, ranges);

  ranges.sort((a, b) => a.start - b.start);

  return {
    contains(offset: number): boolean {
      let lo = 0;
      let hi = ranges.length - 1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const r = ranges[mid]!;
        if (offset < r.start) hi = mid - 1;
        else if (offset >= r.end) lo = mid + 1;
        else return true;
      }
      return false;
    }
  };
}

function collect(text: string, regex: RegExp, out: Range[]): void {
  regex.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    out.push({ start: m.index, end: m.index + m[0].length });
    if (m[0].length === 0) regex.lastIndex++;
  }
}
