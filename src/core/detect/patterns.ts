import { NAMED_COLOR_LIST } from '../color/named.js';
import type { ColorNotation } from '../color/types.js';

export interface Pattern {
  readonly notation: ColorNotation;
  readonly regex: RegExp;
}

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

/** Patterns applied to every file. Named colors are added separately, since they are opt-in. */
export const CORE_PATTERNS: readonly Pattern[] = [
  { notation: 'hex', regex: HEX_PATTERN },
  { notation: 'rgb', regex: FUNCTION_PATTERN },
  { notation: 'color', regex: COLOR_FUNCTION_PATTERN }
];

export const NAMED_PATTERN_ENTRY: Pattern = { notation: 'named', regex: NAMED_PATTERN };
