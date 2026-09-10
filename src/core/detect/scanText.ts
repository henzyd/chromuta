import type { Color, ColorNotation } from '../color/types.js';
import { dialectPatternsFor } from '../dialects/registry.js';
import type { DialectPattern } from '../dialects/types.js';
import { findCommentRanges } from './comments.js';
import { scoreMatch } from './confidence.js';
import { CORE_PATTERNS, NAMED_PATTERN_ENTRY } from './patterns.js';
import type { ColorMatch, RawMatch, ScanContext } from './types.js';

/** Every pattern that should run against a file, CSS plus any active dialects. */
export function patternsFor(context: ScanContext): readonly DialectPattern[] {
  const patterns: DialectPattern[] = [...CORE_PATTERNS];
  if (context.namedColors !== false) patterns.push(NAMED_PATTERN_ENTRY);
  patterns.push(...dialectPatternsFor(context, context.dialects ?? []));
  return patterns;
}

/**
 * Find every color literal in a block of text.
 *
 * This is the hot loop: it runs over every file in the workspace, so it does one pass
 * per pattern and one pass for comment ranges, and nothing else.
 */
export function scanText(text: string, context: ScanContext = {}): ColorMatch[] {
  const candidates = collectCandidates(text, patternsFor(context));
  if (candidates.length === 0) return [];

  const comments = findCommentRanges(text);

  return resolveOverlaps(candidates).map((candidate) => {
    const { confidence, flags } = scoreMatch(candidate, text, context, comments);
    return { ...candidate, confidence, flags };
  });
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

interface Candidate extends RawMatch {
  readonly color: Color;
  readonly priority: number;
}

/**
 * Run every pattern and keep the hits that parse.
 *
 * Parsing happens before overlap resolution, not after. Two patterns often claim the
 * same span where only one of them can read it: the CSS function pattern matches
 * Tailwind's `rgb(0_0_0)` but cannot parse the underscores. Resolving overlaps first
 * would let the CSS pattern win and then drop the match entirely.
 */
function collectCandidates(
  text: string,
  patterns: readonly DialectPattern[]
): Candidate[] {
  const all: Candidate[] = [];

  for (const pattern of patterns) {
    pattern.regex.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.regex.exec(text)) !== null) {
      const raw = match[0];
      if (raw.length === 0) {
        pattern.regex.lastIndex++;
        continue;
      }

      const color = pattern.parse(raw);
      // A regex hit that will not parse is a false positive by definition. Dropping it
      // here is what lets the patterns stay permissive.
      if (color === null) continue;

      all.push({
        start: match.index,
        end: match.index + raw.length,
        text: raw,
        notation: notationOf(pattern, raw, color),
        color,
        priority: pattern.priority ?? 0
      });
    }
  }

  return all;
}

/**
 * The most specific notation available: a pattern's own refinement first, then what
 * the CSS parser recorded, then the pattern's declared notation.
 *
 * The refinement has to come first. A dialect parser that delegates to the CSS parser
 * gets the inner CSS notation stamped onto the color, which would report a Tailwind
 * bracket value as plain `rgb` and let a rewrite put spaces in a class name.
 */
function notationOf(pattern: DialectPattern, raw: string, color: Color): ColorNotation {
  return pattern.notationFor?.(raw) ?? color.source?.notation ?? pattern.notation;
}

/**
 * Keep one match per span of text.
 *
 * Longest wins, because a nested keyword should lose to the literal containing it.
 * Where two patterns cover exactly the same characters, priority decides: Android's
 * 8-digit hex and CSS's 8-digit hex are the same characters meaning different colors,
 * and inside an Android resource file the Android reading has to win.
 */
function resolveOverlaps(candidates: Candidate[]): ColorMatch[] {
  candidates.sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    if (a.end !== b.end) return b.end - a.end;
    return b.priority - a.priority;
  });

  const kept: ColorMatch[] = [];
  let lastEnd = -1;

  for (const candidate of candidates) {
    if (candidate.start < lastEnd) continue;
    const { priority, ...match } = candidate;
    kept.push({ ...match, confidence: 1, flags: [] });
    lastEnd = candidate.end;
  }

  return kept;
}
