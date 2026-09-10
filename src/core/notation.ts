import { formatColor, isLossyConversion } from './color/format.js';
import {
  isDialectNotation,
  isOutputNotation,
  type AnyOutputNotation,
  type Color,
  type ColorNotation,
  type FormatOptions,
  type OutputNotation
} from './color/types.js';
import { formatDialectColor } from './dialects/format.js';
import { dialectNotationsFor, dialectOf } from './dialects/registry.js';
import type { DialectContext, DialectId } from './dialects/types.js';

/**
 * Write a color in any notation, CSS or platform.
 *
 * Single entry point so callers never have to know which family a notation belongs to.
 */
export function formatAny(
  color: Color,
  notation: AnyOutputNotation,
  options: FormatOptions
): string | null {
  if (isDialectNotation(notation)) return formatDialectColor(color, notation, options);
  return formatColor(color, notation, options);
}

/**
 * Whether writing this color in this notation loses information.
 *
 * Every platform notation here is sRGB-bound, so a wide-gamut color has its chroma
 * reduced to fit exactly as it would in hex.
 */
export function isLossyAny(color: Color, notation: AnyOutputNotation): boolean {
  if (isOutputNotation(notation)) return isLossyConversion(color, notation);
  return isLossyConversion(color, 'hex');
}

/** A human-readable label, since notation ids like `dart-rgbo` are not self-explaining. */
export function notationLabel(notation: ColorNotation): string {
  switch (notation) {
    case 'dart-color': return 'Flutter Color(0x…)';
    case 'dart-argb': return 'Flutter Color.fromARGB';
    case 'dart-rgbo': return 'Flutter Color.fromRGBO';
    case 'argb-hex': return 'ARGB integer';
    case 'android-hex': return 'Android #AARRGGBB';
    case 'swift-uicolor': return 'UIColor';
    case 'swift-nscolor': return 'NSColor';
    case 'swift-color': return 'SwiftUI Color';
    case 'swift-hsb': return 'UIColor(hue:…)';
    case 'swift-white': return 'UIColor(white:…)';
    case 'tw-rgb': return 'Tailwind rgb()';
    case 'tw-hsl': return 'Tailwind hsl()';
    case 'tw-oklch': return 'Tailwind oklch()';
    default: return notation;
  }
}

/**
 * Conversion targets to offer for one literal, in the order they should appear.
 *
 * Notations from the same idiom come first. Someone editing `Color(0xFF3B82F6)` in a
 * Dart file wants the other Flutter forms before they want `hsl()`, and someone
 * editing a hex string in that same file wants the CSS forms.
 */
export function notationsForMatch(
  matchNotation: ColorNotation,
  context: DialectContext,
  enabledDialects: readonly DialectId[],
  cssNotations: readonly OutputNotation[]
): AnyOutputNotation[] {
  const dialectNotations = dialectNotationsFor(context, enabledDialects);
  const family = dialectOf(matchNotation);

  const sameFamily = family === 'css'
    ? cssNotations
    : dialectNotations.filter((notation) => dialectOf(notation) === family);

  const rest = family === 'css'
    ? dialectNotations
    : [...cssNotations, ...dialectNotations.filter((notation) => dialectOf(notation) !== family)];

  const ordered: AnyOutputNotation[] = [];
  for (const notation of [...sameFamily, ...rest]) {
    if (!ordered.includes(notation)) ordered.push(notation);
  }
  return ordered;
}
