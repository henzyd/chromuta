import type { FormatOptions } from '../color/types.js';
import type { ColorMatch } from './types.js';

/**
 * Conventions observed in a file. Every field is optional: absent means the file
 * gave no clear signal, and the user's configured default should stand.
 */
export interface StyleProfile {
  hexCase?: 'lower' | 'upper';
  shorthandHex?: boolean;
  functionSyntax?: 'modern' | 'legacy';
  alphaStyle?: 'number' | 'percent';
  spaceAfterComma?: boolean;
}

/**
 * Infer a file's color-writing conventions from the literals already in it.
 *
 * Rewriting `#FFF` into `rgb(255, 255, 255)` in a file that uses lowercase hex and
 * modern function syntax everywhere else is how a tool like this gets uninstalled.
 * Matching the surrounding code matters more than matching a global default.
 */
export function inferStyle(matches: readonly ColorMatch[]): StyleProfile {
  let upperHex = 0;
  let lowerHex = 0;
  let shorthand = 0;
  let longhand = 0;
  let legacy = 0;
  let modern = 0;
  let percentAlpha = 0;
  let numberAlpha = 0;
  let spacedComma = 0;
  let tightComma = 0;

  for (const m of matches) {
    const raw = m.text;

    // Platform hex forms carry the same casing signal as CSS hex. A Flutter file
    // written in `Color(0xFF3B82F6)` should keep producing uppercase.
    if (m.notation === 'argb-hex' || m.notation === 'android-hex' || m.notation === 'dart-color') {
      const digits = raw.replace(/^.*?(?:0[xX]|#)/, '').replace(/\).*$/, '');
      if (/[A-F]/.test(digits)) upperHex++;
      else if (/[a-f]/.test(digits)) lowerHex++;
      continue;
    }

    if (m.notation === 'hex') {
      const digits = raw.slice(1);
      // Digit-only values such as #003 carry no casing signal.
      if (/[A-F]/.test(digits)) upperHex++;
      else if (/[a-f]/.test(digits)) lowerHex++;

      if (digits.length <= 4) shorthand++;
      else if (isShortenable(digits)) longhand++;
      continue;
    }

    if (!raw.includes('(')) continue;

    const inner = raw.slice(raw.indexOf('(') + 1, raw.lastIndexOf(')'));

    if (inner.includes(',')) {
      legacy++;
      if (/,\s/.test(inner)) spacedComma++;
      else tightComma++;
    } else if (/[a-z]/i.test(raw.slice(0, raw.indexOf('(')))) {
      modern++;
    }

    const alpha = alphaArgument(inner);
    if (alpha !== null) {
      if (alpha.endsWith('%')) percentAlpha++;
      else numberAlpha++;
    }
  }

  const profile: StyleProfile = {};

  if (upperHex !== lowerHex) profile.hexCase = upperHex > lowerHex ? 'upper' : 'lower';
  if (shorthand !== longhand) profile.shorthandHex = shorthand > longhand;
  if (legacy !== modern) profile.functionSyntax = legacy > modern ? 'legacy' : 'modern';
  if (percentAlpha !== numberAlpha) profile.alphaStyle = percentAlpha > numberAlpha ? 'percent' : 'number';
  if (spacedComma !== tightComma) profile.spaceAfterComma = spacedComma > tightComma;

  return profile;
}

/**
 * Layer a file's inferred conventions under the user's explicit settings.
 * Explicit settings win; inference only fills what the user left at its default.
 */
export function applyStyleProfile(
  base: FormatOptions,
  profile: StyleProfile,
  overridden: ReadonlySet<keyof FormatOptions> = new Set()
): FormatOptions {
  const result = { ...base };
  for (const [key, value] of Object.entries(profile) as [keyof StyleProfile, unknown][]) {
    if (value === undefined || overridden.has(key as keyof FormatOptions)) continue;
    (result as Record<string, unknown>)[key] = value;
  }
  return result;
}

function isShortenable(digits: string): boolean {
  if (digits.length !== 6 && digits.length !== 8) return false;
  for (let i = 0; i < digits.length; i += 2) {
    if (digits[i]!.toLowerCase() !== digits[i + 1]!.toLowerCase()) return false;
  }
  return true;
}

function alphaArgument(inner: string): string | null {
  const slash = inner.lastIndexOf('/');
  if (slash !== -1) return inner.slice(slash + 1).trim() || null;

  const parts = inner.split(',').map((p) => p.trim()).filter(Boolean);
  return parts.length === 4 ? parts[3]! : null;
}
