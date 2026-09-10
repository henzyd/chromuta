import { parseColor } from '../color/parse.js';
import { findCommentRanges } from './comments.js';
import { scoreMatch } from './confidence.js';
import { CORE_PATTERNS, NAMED_PATTERN_ENTRY, type Pattern } from './patterns.js';
import type { ColorMatch, RawMatch, ScanContext } from './types.js';

/**
 * Find every color literal in a block of text.
 *
 * This is the hot loop: it runs over every file in the workspace, so it does one
 * pass per pattern and one pass for comment ranges, and nothing else.
 */
export function scanText(text: string, context: ScanContext = {}): ColorMatch[] {
  const patterns: Pattern[] = [...CORE_PATTERNS];
  if (context.namedColors !== false) patterns.push(NAMED_PATTERN_ENTRY);

  const raw = collectMatches(text, patterns);
  if (raw.length === 0) return [];

  const comments = findCommentRanges(text);
  const results: ColorMatch[] = [];

  for (const match of raw) {
    const color = parseColor(match.text);
    // A regex hit that will not parse is a false positive by definition. Dropping it
    // here is what lets the patterns stay permissive.
    if (color === null) continue;

    const { confidence, flags } = scoreMatch(match, text, context, comments);

    results.push({
      ...match,
      // The patterns only coarsely classify; the parser knows the real notation.
      notation: color.source?.notation ?? match.notation,
      color,
      confidence,
      flags
    });
  }

  return results;
}

/** Matches at or above the confidence threshold, i.e. those safe to bulk-edit. */
export function confidentMatches(
  matches: readonly ColorMatch[],
  threshold: number
): ColorMatch[] {
  return matches.filter((m) => m.confidence >= threshold);
}

/** The match containing a given offset, if any. */
export function matchAtOffset(
  matches: readonly ColorMatch[],
  offset: number
): ColorMatch | undefined {
  return matches.find((m) => offset >= m.start && offset <= m.end);
}

// ---------------------------------------------------------------------------

function collectMatches(text: string, patterns: readonly Pattern[]): RawMatch[] {
  const all: RawMatch[] = [];

  for (const { notation, regex } of patterns) {
    regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text)) !== null) {
      all.push({ start: m.index, end: m.index + m[0].length, text: m[0], notation });
      if (m[0].length === 0) regex.lastIndex++;
    }
  }

  return resolveOverlaps(all);
}

/**
 * Different patterns can claim overlapping spans, for instance the named-color
 * pattern matching `red` inside a longer identifier the function pattern also saw.
 * Longest match at the earliest position wins, so downstream edits never collide.
 */
function resolveOverlaps(matches: RawMatch[]): RawMatch[] {
  matches.sort((a, b) => (a.start !== b.start ? a.start - b.start : b.end - a.end));

  const kept: RawMatch[] = [];
  let lastEnd = -1;

  for (const m of matches) {
    if (m.start >= lastEnd) {
      kept.push(m);
      lastEnd = m.end;
    }
  }

  return kept;
}
