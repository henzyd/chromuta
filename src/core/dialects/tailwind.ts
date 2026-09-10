import { parseColor } from '../color/parse.js';
import type { Color } from '../color/types.js';
import type { Dialect, DialectContext, DialectPattern } from './types.js';

/**
 * A color function inside Tailwind's arbitrary-value brackets.
 *
 * Tailwind class names cannot contain spaces, so a multi-part value is written with
 * underscores: `text-[rgb(0_0_0)]`. The CSS parser would see `0_0_0` as one token and
 * reject it, which is why this needs its own entry rather than falling through.
 *
 * Bare hex such as `bg-[#3b82f6]` needs nothing special and is left to the CSS
 * pattern, but writing a *replacement* into a bracket does, which is what the
 * `tw-` output notations are for.
 */
const TAILWIND_FUNCTION =
  /(?<=\[)(?:rgba?|hsla?|hwb|oklch|oklab|lch|lab)\([^\][()]*?\)(?=\])/gi;

/** Underscores stand in for spaces; everything else is ordinary CSS. */
export function decodeTailwindValue(raw: string): string {
  return raw.split('_').join(' ');
}

/** The inverse, for writing a value back into a class name. */
export function encodeTailwindValue(text: string): string {
  return text.split(' ').join('_');
}

export function parseTailwindFunction(raw: string): Color | null {
  return parseColor(decodeTailwindValue(raw));
}

/**
 * Which Tailwind notation a bracketed value is.
 *
 * Needed because parsing delegates to the CSS parser, which stamps the inner notation
 * onto the color. Without this the match would report itself as plain `rgb`, and a
 * rewrite would then write spaces into a class name.
 */
export function tailwindNotationFor(raw: string): 'tw-rgb' | 'tw-hsl' | 'tw-oklch' {
  const fn = /^([a-z]+)\(/i.exec(raw)?.[1]?.toLowerCase() ?? '';
  if (fn === 'hsl' || fn === 'hsla' || fn === 'hwb') return 'tw-hsl';
  if (fn === 'rgb' || fn === 'rgba') return 'tw-rgb';
  return 'tw-oklch';
}

const PATTERNS: readonly DialectPattern[] = [
  // Above the CSS function pattern, which claims the same span but cannot parse it.
  {
    notation: 'tw-rgb',
    regex: TAILWIND_FUNCTION,
    parse: parseTailwindFunction,
    notationFor: tailwindNotationFor,
    priority: 30
  }
];

const LANGUAGES = new Set([
  'html', 'vue', 'svelte', 'astro',
  'javascript', 'javascriptreact', 'typescript', 'typescriptreact',
  'php', 'erb', 'handlebars', 'twig', 'blade'
]);

export const tailwindDialect: Dialect = {
  id: 'tailwind',
  applies: (context: DialectContext) =>
    context.languageId !== undefined && LANGUAGES.has(context.languageId),
  patterns: PATTERNS
};
