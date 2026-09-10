import type { Color } from '../color/types.js';
import { colorFromRgb } from '../color/parse.js';
import type { Dialect, DialectContext, DialectPattern } from './types.js';
import { parseArgbDigits, positionalArguments, toByteChannel, toNumber } from './shared.js';

/** `Color(0xFF3B82F6)`, including a `const` or `static const` in front. */
const DART_COLOR = /\bColor\(\s*0[xX](?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6})\s*\)/g;

/** `Color.fromARGB(255, 59, 130, 246)` */
const DART_FROM_ARGB = /\bColor\.fromARGB\(\s*[^()]*?\)/g;

/** `Color.fromRGBO(59, 130, 246, 1.0)` */
const DART_FROM_RGBO = /\bColor\.fromRGBO\(\s*[^()]*?\)/g;

/**
 * A bare integer literal.
 *
 * Deliberately low-trust: `0xDEADBEEF` is just as likely to be a bitmask as a color,
 * so the confidence scorer demotes these unless the surrounding line reads like it is
 * about color. Matches inside `Color(...)` are claimed by the longer pattern above.
 */
const BARE_ARGB = /\b0[xX](?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6})(?![0-9a-fA-F])/g;

export function parseDartColor(raw: string): Color | null {
  const match = /0[xX]([0-9a-fA-F]+)/.exec(raw);
  return match ? parseArgbDigits(match[1]!) : null;
}

export function parseBareArgb(raw: string): Color | null {
  const match = /^0[xX]([0-9a-fA-F]+)$/.exec(raw.trim());
  return match ? parseArgbDigits(match[1]!) : null;
}

export function parseFromArgb(raw: string): Color | null {
  const inner = innerArguments(raw);
  if (inner === null) return null;

  const parts = positionalArguments(inner);
  if (parts.length !== 4) return null;

  const a = toByteChannel(parts[0]!);
  const r = toByteChannel(parts[1]!);
  const g = toByteChannel(parts[2]!);
  const b = toByteChannel(parts[3]!);
  if (a === null || r === null || g === null || b === null) return null;

  return colorFromRgb({ r, g, b }, a);
}

export function parseFromRgbo(raw: string): Color | null {
  const inner = innerArguments(raw);
  if (inner === null) return null;

  const parts = positionalArguments(inner);
  if (parts.length !== 4) return null;

  const r = toByteChannel(parts[0]!);
  const g = toByteChannel(parts[1]!);
  const b = toByteChannel(parts[2]!);
  // fromRGBO takes opacity as a 0-1 double, not a byte.
  const opacity = toNumber(parts[3]!);
  if (r === null || g === null || b === null || opacity === null) return null;
  if (opacity < 0 || opacity > 1) return null;

  return colorFromRgb({ r, g, b }, opacity);
}

function innerArguments(raw: string): string | null {
  const open = raw.indexOf('(');
  const close = raw.lastIndexOf(')');
  if (open === -1 || close <= open) return null;
  return raw.slice(open + 1, close);
}

const PATTERNS: readonly DialectPattern[] = [
  { notation: 'dart-color', regex: DART_COLOR, parse: parseDartColor, priority: 20 },
  { notation: 'dart-argb', regex: DART_FROM_ARGB, parse: parseFromArgb, priority: 20 },
  { notation: 'dart-rgbo', regex: DART_FROM_RGBO, parse: parseFromRgbo, priority: 20 },
  { notation: 'argb-hex', regex: BARE_ARGB, parse: parseBareArgb, priority: 5 }
];

const LANGUAGES = new Set(['dart']);

export const flutterDialect: Dialect = {
  id: 'flutter',
  applies: (context: DialectContext) =>
    context.languageId !== undefined && LANGUAGES.has(context.languageId),
  patterns: PATTERNS
};
