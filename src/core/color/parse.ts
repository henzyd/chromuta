import { NAMED_COLORS } from './named.js';
import {
  hslToRgb,
  hwbToRgb,
  labToOkLab,
  lchToLab,
  linearP3ToXyzD65,
  linearRgbToOkLab,
  okLchToOkLab,
  rgbToLinearRgb,
  rgbToOkLab,
  xyzD65ToLinearRgb,
  xyzD50ToD65
} from './spaces.js';
import type { Color, ColorNotation, Rgb, Xyz } from './types.js';

/** Color spaces accepted inside `color()`. Others parse to null rather than guessing. */
const SUPPORTED_COLOR_SPACES = new Set([
  'srgb',
  'srgb-linear',
  'display-p3',
  'xyz',
  'xyz-d50',
  'xyz-d65'
]);

const FUNCTION_NAMES = new Set([
  'rgb', 'rgba', 'hsl', 'hsla', 'hwb', 'oklch', 'oklab', 'lab', 'lch', 'color'
]);

/**
 * Parse a single color literal. Returns null for anything unrecognized rather than
 * throwing, because the detector feeds it every regex hit and false positives are
 * expected to fail here.
 */
export function parseColor(text: string): Color | null {
  const raw = text.trim();
  if (raw.length === 0) return null;

  if (raw.startsWith('#')) return parseHex(raw);

  const fnMatch = /^([a-zA-Z-]+)\((.*)\)$/s.exec(raw);
  if (fnMatch) {
    const name = (fnMatch[1] ?? '').toLowerCase();
    const inner = fnMatch[2] ?? '';
    if (!FUNCTION_NAMES.has(name)) return null;
    return parseFunction(name, inner, raw);
  }

  return parseKeyword(raw);
}

// ---------------------------------------------------------------------------
// Hex
// ---------------------------------------------------------------------------

function parseHex(raw: string): Color | null {
  const digits = raw.slice(1);
  if (!/^[0-9a-fA-F]+$/.test(digits)) return null;

  let r: number, g: number, b: number, a: number;

  switch (digits.length) {
    case 3:
    case 4: {
      const dup = (i: number): number => parseInt(digits[i]! + digits[i]!, 16) / 255;
      r = dup(0); g = dup(1); b = dup(2);
      a = digits.length === 4 ? dup(3) : 1;
      break;
    }
    case 6:
    case 8: {
      const pair = (i: number): number => parseInt(digits.slice(i, i + 2), 16) / 255;
      r = pair(0); g = pair(2); b = pair(4);
      a = digits.length === 8 ? pair(6) : 1;
      break;
    }
    default:
      return null;
  }

  return fromRgb({ r, g, b }, a, 'hex', raw);
}

// ---------------------------------------------------------------------------
// Functional notations
// ---------------------------------------------------------------------------

function parseFunction(name: string, inner: string, raw: string): Color | null {
  const args = splitArgs(inner, name === 'color');
  if (!args) return null;

  const alpha = args.alpha === null ? 1 : parseAlpha(args.alpha);
  if (alpha === null) return null;

  const c = args.components;

  switch (name) {
    case 'rgb':
    case 'rgba': {
      if (c.length !== 3) return null;
      const r = parseRgbChannel(c[0]!);
      const g = parseRgbChannel(c[1]!);
      const b = parseRgbChannel(c[2]!);
      if (r === null || g === null || b === null) return null;
      return fromRgb({ r, g, b }, alpha, 'rgb', raw);
    }

    case 'hsl':
    case 'hsla': {
      if (c.length !== 3) return null;
      const h = parseAngle(c[0]!);
      const s = parseScalar(c[1]!, 100);
      const l = parseScalar(c[2]!, 100);
      if (h === null || s === null || l === null) return null;
      return fromRgb(hslToRgb({ h, s, l }), alpha, 'hsl', raw);
    }

    case 'hwb': {
      if (c.length !== 3) return null;
      const h = parseAngle(c[0]!);
      const w = parseScalar(c[1]!, 100);
      const bl = parseScalar(c[2]!, 100);
      if (h === null || w === null || bl === null) return null;
      return fromRgb(hwbToRgb(h, w, bl), alpha, 'hwb', raw);
    }

    case 'oklch': {
      if (c.length !== 3) return null;
      const L = parseScalar(c[0]!, 1);
      const C = parseScalar(c[1]!, 0.4);
      const H = parseAngle(c[2]!);
      if (L === null || C === null || H === null) return null;
      return { ok: okLchToOkLab({ L, C, H }), alpha, source: { notation: 'oklch', raw } };
    }

    case 'oklab': {
      if (c.length !== 3) return null;
      const L = parseScalar(c[0]!, 1);
      const a = parseScalar(c[1]!, 0.4);
      const b = parseScalar(c[2]!, 0.4);
      if (L === null || a === null || b === null) return null;
      return { ok: { L, a, b }, alpha, source: { notation: 'oklab', raw } };
    }

    case 'lab': {
      if (c.length !== 3) return null;
      const L = parseScalar(c[0]!, 100);
      const a = parseScalar(c[1]!, 125);
      const b = parseScalar(c[2]!, 125);
      if (L === null || a === null || b === null) return null;
      return { ok: labToOkLab({ L, a, b }), alpha, source: { notation: 'lab', raw } };
    }

    case 'lch': {
      if (c.length !== 3) return null;
      const L = parseScalar(c[0]!, 100);
      const C = parseScalar(c[1]!, 150);
      const H = parseAngle(c[2]!);
      if (L === null || C === null || H === null) return null;
      return { ok: labToOkLab(lchToLab({ L, C, H })), alpha, source: { notation: 'lch', raw } };
    }

    case 'color':
      return parseColorFunction(c, alpha, raw);

    default:
      return null;
  }
}

function parseColorFunction(components: string[], alpha: number, raw: string): Color | null {
  if (components.length !== 4) return null;

  const space = components[0]!.toLowerCase();
  if (!SUPPORTED_COLOR_SPACES.has(space)) return null;

  const x = parseScalar(components[1]!, 1);
  const y = parseScalar(components[2]!, 1);
  const z = parseScalar(components[3]!, 1);
  if (x === null || y === null || z === null) return null;

  switch (space) {
    case 'srgb':
      return fromRgb({ r: x, g: y, b: z }, alpha, 'color', raw);
    case 'srgb-linear':
      return { ok: linearRgbToOkLab({ r: x, g: y, b: z }), alpha, source: { notation: 'color', raw } };
    case 'display-p3': {
      const lin = rgbToLinearRgb({ r: x, g: y, b: z });
      return fromXyzD65(linearP3ToXyzD65(lin), alpha, raw);
    }
    case 'xyz':
    case 'xyz-d65':
      return fromXyzD65({ x, y, z }, alpha, raw);
    case 'xyz-d50':
      return fromXyzD65(xyzD50ToD65({ x, y, z }), alpha, raw);
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Keywords
// ---------------------------------------------------------------------------

function parseKeyword(raw: string): Color | null {
  const word = raw.toLowerCase();

  if (word === 'transparent') {
    return fromRgb({ r: 0, g: 0, b: 0 }, 0, 'named', raw);
  }

  const hex = NAMED_COLORS[word];
  if (hex === undefined) return null;

  const pair = (i: number): number => parseInt(hex.slice(i, i + 2), 16) / 255;
  return fromRgb({ r: pair(0), g: pair(2), b: pair(4) }, 1, 'named', raw);
}

// ---------------------------------------------------------------------------
// Argument splitting
// ---------------------------------------------------------------------------

interface SplitArgs {
  components: string[];
  alpha: string | null;
}

/**
 * Split function arguments, accepting both the modern space-separated form with a
 * slash before alpha and the legacy comma-separated form.
 */
function splitArgs(inner: string, isColorFunction: boolean): SplitArgs | null {
  const trimmed = inner.trim();
  if (trimmed.length === 0) return null;

  // Nested functions such as calc() are out of scope. Bail so the match is dropped
  // rather than rewritten into something wrong.
  if (trimmed.includes('(')) return null;

  const slash = trimmed.lastIndexOf('/');
  if (slash !== -1) {
    const left = trimmed.slice(0, slash).trim();
    const right = trimmed.slice(slash + 1).trim();
    if (right.length === 0) return null;
    return { components: splitOnWhitespaceOrComma(left), alpha: right };
  }

  const parts = splitOnWhitespaceOrComma(trimmed);

  // color() spends its first argument on the space name, so it carries four
  // components rather than three. Counting it as a channel would make
  // color(srgb 1 0 0) parse as three channels plus an alpha.
  const componentCount = isColorFunction ? 4 : 3;
  if (parts.length === componentCount + 1) {
    return { components: parts.slice(0, componentCount), alpha: parts[componentCount]! };
  }

  return { components: parts, alpha: null };
}

function splitOnWhitespaceOrComma(s: string): string[] {
  return s
    .split(/[\s,]+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

// ---------------------------------------------------------------------------
// Component parsing
// ---------------------------------------------------------------------------

const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

/** `none` is a valid CSS component meaning "missing"; outside interpolation it behaves as zero. */
function isNone(s: string): boolean {
  return s.toLowerCase() === 'none';
}

/**
 * A component that is either a plain number or a percentage, where 100% maps to
 * `percentScale`. Returns the value already in its target unit.
 */
function parseScalar(s: string, percentScale: number): number | null {
  if (isNone(s)) return 0;
  if (s.endsWith('%')) {
    const n = s.slice(0, -1);
    if (!NUMBER.test(n)) return null;
    return (parseFloat(n) / 100) * percentScale;
  }
  if (!NUMBER.test(s)) return null;
  return parseFloat(s);
}

/** rgb() channels are 0-255 as numbers or 0-100% as percentages, normalized to 0..1. */
function parseRgbChannel(s: string): number | null {
  if (isNone(s)) return 0;
  if (s.endsWith('%')) {
    const v = parseScalar(s, 1);
    return v === null ? null : v;
  }
  if (!NUMBER.test(s)) return null;
  return parseFloat(s) / 255;
}

function parseAlpha(s: string): number | null {
  const v = parseScalar(s, 1);
  if (v === null) return null;
  return Math.min(1, Math.max(0, v));
}

function parseAngle(s: string): number | null {
  if (isNone(s)) return 0;

  const match = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)(deg|grad|rad|turn)?$/.exec(s);
  if (!match) return null;

  const value = parseFloat(match[1]!);
  switch (match[2]) {
    case 'grad': return (value * 360) / 400;
    case 'rad': return (value * 180) / Math.PI;
    case 'turn': return value * 360;
    default: return value;
  }
}

// ---------------------------------------------------------------------------
// Constructors
// ---------------------------------------------------------------------------

function fromRgb(rgb: Rgb, alpha: number, notation: ColorNotation, raw: string): Color {
  return { ok: rgbToOkLab(rgb), alpha, source: { notation, raw } };
}

function fromXyzD65(xyz: Xyz, alpha: number, raw: string): Color {
  return {
    ok: linearRgbToOkLab(xyzD65ToLinearRgb(xyz)),
    alpha,
    source: { notation: 'color', raw }
  };
}

/** Build a Color from sRGB channels in 0..1, for callers outside the parser. */
export function colorFromRgb(rgb: Rgb, alpha = 1): Color {
  return { ok: rgbToOkLab(rgb), alpha };
}
