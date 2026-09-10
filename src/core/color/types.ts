/** CSS notations Chromuta can read or write. */
export type CssNotation =
  | 'hex'
  | 'rgb'
  | 'hsl'
  | 'hwb'
  | 'oklch'
  | 'oklab'
  | 'lab'
  | 'lch'
  | 'named'
  | 'color';

/**
 * Notations belonging to a specific platform rather than to CSS.
 *
 * These exist so a rewrite stays in the idiom of the file it is in. Converting
 * `Color(0xFF3B82F6)` in a Dart file has to produce another Dart color, not `#2563eb`.
 */
export type DialectNotation =
  // Flutter / Dart
  | 'dart-color'
  | 'dart-argb'
  | 'dart-rgbo'
  // Android and Flutter raw integer literals
  | 'argb-hex'
  // Android resource XML, where 4- and 8-digit hex puts alpha first
  | 'android-hex'
  // Swift and SwiftUI
  | 'swift-uicolor'
  | 'swift-nscolor'
  | 'swift-color'
  | 'swift-hsb'
  | 'swift-white'
  // Tailwind arbitrary values, where spaces are written as underscores
  | 'tw-rgb'
  | 'tw-hsl'
  | 'tw-oklch';

export type ColorNotation = CssNotation | DialectNotation;

/** CSS notations that can be produced as output. */
export type OutputNotation = Exclude<CssNotation, 'hwb' | 'color'>;

/** Dialect notations that can be produced as output. */
export type DialectOutputNotation = Exclude<DialectNotation, 'swift-hsb' | 'swift-white'>;

/** Anything Chromuta can write. */
export type AnyOutputNotation = OutputNotation | DialectOutputNotation;

/** The same sets at runtime, for validating user-supplied values. */
export const OUTPUT_NOTATIONS: readonly OutputNotation[] = [
  'hex', 'rgb', 'hsl', 'oklch', 'oklab', 'lab', 'lch', 'named'
];

export const DIALECT_OUTPUT_NOTATIONS: readonly DialectOutputNotation[] = [
  'dart-color', 'dart-argb', 'dart-rgbo', 'argb-hex', 'android-hex',
  'swift-uicolor', 'swift-nscolor', 'swift-color',
  'tw-rgb', 'tw-hsl', 'tw-oklch'
];

export const ALL_OUTPUT_NOTATIONS: readonly AnyOutputNotation[] = [
  ...OUTPUT_NOTATIONS,
  ...DIALECT_OUTPUT_NOTATIONS
];

export function isOutputNotation(value: unknown): value is OutputNotation {
  return typeof value === 'string' && (OUTPUT_NOTATIONS as readonly string[]).includes(value);
}

export function isDialectNotation(value: unknown): value is DialectOutputNotation {
  return typeof value === 'string' && (DIALECT_OUTPUT_NOTATIONS as readonly string[]).includes(value);
}

export function isAnyOutputNotation(value: unknown): value is AnyOutputNotation {
  return isOutputNotation(value) || isDialectNotation(value);
}

/**
 * A parsed color.
 *
 * OKLab is the canonical space rather than sRGB. Storing sRGB triples would clip
 * any wide-gamut literal at parse time, corrupting values the user never asked to
 * change, and it would make perceptual distance expensive. OKLab holds them
 * losslessly and reduces distance to a Euclidean metric.
 */
export interface Color {
  readonly ok: OkLab;
  /** 0..1 */
  readonly alpha: number;
  /** How the value appeared in source, so an unchanged notation round-trips verbatim. */
  readonly source?: ColorSource;
}

export interface ColorSource {
  readonly notation: ColorNotation;
  readonly raw: string;
}

export interface OkLab {
  readonly L: number;
  readonly a: number;
  readonly b: number;
}

export interface OkLch {
  readonly L: number;
  readonly C: number;
  /** Degrees, 0..360. */
  readonly H: number;
}

/** Non-linear sRGB, each channel 0..1. May fall outside that range if out of gamut. */
export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface Hsl {
  /** Degrees, 0..360. */
  readonly h: number;
  /** 0..100 */
  readonly s: number;
  /** 0..100 */
  readonly l: number;
}

/** CIE Lab with a D50 white point, as CSS `lab()` specifies. */
export interface Lab {
  /** 0..100 */
  readonly L: number;
  readonly a: number;
  readonly b: number;
}

export interface Lch {
  readonly L: number;
  readonly C: number;
  /** Degrees, 0..360. */
  readonly H: number;
}

export interface Xyz {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface FormatOptions {
  hexCase: 'lower' | 'upper';
  shorthandHex: boolean;
  functionSyntax: 'modern' | 'legacy';
  alphaStyle: 'number' | 'percent';
  precision: number;
  /** Legacy syntax only. */
  spaceAfterComma: boolean;
}

export const DEFAULT_FORMAT_OPTIONS: FormatOptions = {
  hexCase: 'lower',
  shorthandHex: true,
  functionSyntax: 'modern',
  alphaStyle: 'number',
  precision: 3,
  spaceAfterComma: true
};
