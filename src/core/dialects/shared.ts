import { colorFromRgb } from '../color/parse.js';
import { clampToSrgbGamut } from '../color/gamut.js';
import type { Color, FormatOptions } from '../color/types.js';

const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

export function toNumber(text: string): number | null {
  const trimmed = text.trim();
  if (!NUMBER.test(trimmed)) return null;
  const value = parseFloat(trimmed);
  return Number.isFinite(value) ? value : null;
}

/** An integer channel in 0-255, as Dart's fromARGB and fromRGBO use. */
export function toByteChannel(text: string): number | null {
  const value = toNumber(text);
  if (value === null || value < 0 || value > 255) return null;
  return value / 255;
}

/** A float channel in 0-1, as Swift's colors use. */
export function toUnitChannel(text: string): number | null {
  const value = toNumber(text);
  if (value === null || value < -0.001 || value > 1.001) return null;
  return Math.min(1, Math.max(0, value));
}

/**
 * Parse a run of hex digits where alpha comes first.
 *
 * Android and Flutter both write ARGB, so `#FF3B82F6` there is opaque #3B82F6. CSS
 * reads the same characters as RRGGBBAA, which would be a 96%-opaque pink-grey. Both
 * are correct in their own file, which is why this cannot live in the CSS parser.
 */
export function parseArgbDigits(digits: string): Color | null {
  if (!/^[0-9a-fA-F]+$/.test(digits)) return null;

  const pair = (i: number): number => parseInt(digits.slice(i, i + 2), 16) / 255;
  const single = (i: number): number => parseInt(digits[i]! + digits[i]!, 16) / 255;

  switch (digits.length) {
    case 3:
      return colorFromRgb({ r: single(0), g: single(1), b: single(2) }, 1);
    case 4:
      return colorFromRgb({ r: single(1), g: single(2), b: single(3) }, single(0));
    case 6:
      return colorFromRgb({ r: pair(0), g: pair(2), b: pair(4) }, 1);
    case 8:
      return colorFromRgb({ r: pair(2), g: pair(4), b: pair(6) }, pair(0));
    default:
      return null;
  }
}

export interface Bytes {
  readonly a: number;
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/** 0-255 integer channels, with the color first brought into sRGB. */
export function toBytes(color: Color): Bytes {
  const rgb = clampToSrgbGamut(color.ok);
  const round = (v: number): number => Math.round(v * 255);
  return { a: round(color.alpha), r: round(rgb.r), g: round(rgb.g), b: round(rgb.b) };
}

/** 0-1 float channels, with the color first brought into sRGB. */
export function toUnits(color: Color): { r: number; g: number; b: number; a: number } {
  const rgb = clampToSrgbGamut(color.ok);
  return { r: rgb.r, g: rgb.g, b: rgb.b, a: color.alpha };
}

export function argbDigits(color: Color, hexCase: FormatOptions['hexCase']): string {
  const { a, r, g, b } = toBytes(color);
  const hex = [a, r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
  return hexCase === 'upper' ? hex.toUpperCase() : hex;
}

/** Round to `precision` places and drop trailing zeros, so 0.500 renders as 0.5. */
export function num(value: number, precision: number): string {
  if (!Number.isFinite(value)) return '0';
  const fixed = value.toFixed(precision);
  return fixed.includes('.') ? fixed.replace(/\.?0+$/, '') : fixed;
}

/** Pull `label: value` pairs out of a Swift-style argument list. */
export function labelledArguments(inner: string): Map<string, string> {
  const result = new Map<string, string>();
  const regex = /([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([^,]+)/g;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(inner)) !== null) {
    result.set(match[1]!.toLowerCase(), match[2]!.trim());
  }
  return result;
}

/** Split a positional argument list on commas. */
export function positionalArguments(inner: string): string[] {
  return inner.split(',').map((part) => part.trim()).filter((part) => part.length > 0);
}

/** HSV, which is what Swift calls hue/saturation/brightness. Not HSL. */
export function hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
  const sector = ((h % 1) + 1) % 1 * 6;
  const c = v * s;
  const x = c * (1 - Math.abs((sector % 2) - 1));
  const m = v - c;

  const table: [number, number, number][] = [
    [c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]
  ];
  const [r, g, b] = table[Math.min(5, Math.floor(sector))]!;
  return { r: r + m, g: g + m, b: b + m };
}
