import { colorFromRgb } from '../color/parse.js';
import type { Color } from '../color/types.js';
import type { Dialect, DialectContext, DialectPattern } from './types.js';
import { hsvToRgb, labelledArguments, toUnitChannel } from './shared.js';

/** UIColor and NSColor share their initializer shapes. */
const UI_OR_NS_COLOR = /\b(?:UIColor|NSColor)\(\s*[^()]*?\)/g;

/** SwiftUI's `Color(red: … , green: … , blue: …)`, with an optional `.sRGB,` first. */
const SWIFTUI_COLOR = /\bColor\(\s*(?:\.[A-Za-z]+\s*,\s*)?(?:red|white|hue)\s*:[^()]*?\)/g;

export function parseSwiftColor(raw: string): Color | null {
  const open = raw.indexOf('(');
  const close = raw.lastIndexOf(')');
  if (open === -1 || close <= open) return null;

  const args = labelledArguments(raw.slice(open + 1, close));

  // Alpha is `alpha:` on UIColor and `opacity:` on SwiftUI's Color.
  const alphaText = args.get('alpha') ?? args.get('opacity');
  const alpha = alphaText === undefined ? 1 : toUnitChannel(alphaText);
  if (alpha === null) return null;

  if (args.has('red') && args.has('green') && args.has('blue')) {
    const r = toUnitChannel(args.get('red')!);
    const g = toUnitChannel(args.get('green')!);
    const b = toUnitChannel(args.get('blue')!);
    if (r === null || g === null || b === null) return null;
    return colorFromRgb({ r, g, b }, alpha);
  }

  if (args.has('white')) {
    const w = toUnitChannel(args.get('white')!);
    if (w === null) return null;
    return colorFromRgb({ r: w, g: w, b: w }, alpha);
  }

  if (args.has('hue') && args.has('saturation') && args.has('brightness')) {
    const h = toUnitChannel(args.get('hue')!);
    const s = toUnitChannel(args.get('saturation')!);
    // Swift calls this brightness; it is HSV value, not HSL lightness.
    const v = toUnitChannel(args.get('brightness')!);
    if (h === null || s === null || v === null) return null;
    return colorFromRgb(hsvToRgb(h, s, v), alpha);
  }

  return null;
}

/**
 * Which concrete notation a raw match is, so a rewrite keeps the same initializer.
 *
 * The grayscale and hue forms are reported as themselves even though neither is an
 * output notation, so the palette says what is actually in the file. Conversion then
 * offers the red/green/blue forms of the same type.
 */
export function swiftNotationFor(
  raw: string
): 'swift-uicolor' | 'swift-nscolor' | 'swift-color' | 'swift-white' | 'swift-hsb' {
  if (/\bwhite\s*:/.test(raw)) return 'swift-white';
  if (/\bhue\s*:/.test(raw)) return 'swift-hsb';
  if (raw.startsWith('NSColor')) return 'swift-nscolor';
  if (raw.startsWith('UIColor')) return 'swift-uicolor';
  return 'swift-color';
}

const PATTERNS: readonly DialectPattern[] = [
  {
    notation: 'swift-uicolor',
    regex: UI_OR_NS_COLOR,
    parse: parseSwiftColor,
    notationFor: swiftNotationFor,
    priority: 20
  },
  {
    notation: 'swift-color',
    regex: SWIFTUI_COLOR,
    parse: parseSwiftColor,
    notationFor: swiftNotationFor,
    priority: 20
  }
];

const LANGUAGES = new Set(['swift', 'objective-c', 'objective-cpp']);

export const swiftDialect: Dialect = {
  id: 'swift',
  applies: (context: DialectContext) =>
    context.languageId !== undefined && LANGUAGES.has(context.languageId),
  patterns: PATTERNS
};
