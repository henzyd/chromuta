import { NAMED_COLOR_LIST } from '../color/named.js';
import { parseColor } from '../color/parse.js';
import type { DialectPattern } from '../dialects/types.js';

/**
 * Hex literals.
 *
 * Alternatives are ordered longest-first and closed with a negative lookahead so a
 * 7-digit run matches nothing at all rather than silently truncating to 6. Anything
 * else would turn `#1234567` into a color it is not.
 */
export const HEX_PATTERN =
  /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![0-9a-fA-F])/g;

/**
 * Functional notations. `lab` and `lch` are listed after their `ok` prefixed
 * siblings, and the leading \b keeps `lab` from matching inside `oklab`.
 */
export const FUNCTION_PATTERN =
  /\b(?:rgba?|hsla?|hwb|oklch|oklab|lch|lab)\(\s*[^()]*?\)/gi;

/** The generic color() function, which names its space as the first argument. */
export const COLOR_FUNCTION_PATTERN = /\bcolor\(\s*[^()]*?\)/gi;

/**
 * CSS named colors, sorted longest-first. Word boundaries already prevent `green`
 * from matching inside `greenyellow`, but the ordering makes that independent of
 * backtracking behavior.
 */
export const NAMED_PATTERN = (() => {
  const sorted = [...NAMED_COLOR_LIST, 'transparent'].sort((a, b) => b.length - a.length);
  return new RegExp(`\\b(?:${sorted.join('|')})\\b`, 'gi');
})();

/** Priority sits below the dialect patterns, which claim overlapping spans deliberately. */
const CSS_PRIORITY = 10;

export const CORE_PATTERNS: readonly DialectPattern[] = [
  { notation: 'hex', regex: HEX_PATTERN, parse: parseColor, priority: CSS_PRIORITY },
  { notation: 'rgb', regex: FUNCTION_PATTERN, parse: parseColor, priority: CSS_PRIORITY },
  { notation: 'color', regex: COLOR_FUNCTION_PATTERN, parse: parseColor, priority: CSS_PRIORITY }
];

export const NAMED_PATTERN_ENTRY: DialectPattern = {
  notation: 'named',
  regex: NAMED_PATTERN,
  parse: parseColor,
  priority: CSS_PRIORITY - 2
};
