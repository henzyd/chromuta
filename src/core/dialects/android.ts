import type { Color } from '../color/types.js';
import type { Dialect, DialectContext, DialectPattern } from './types.js';
import { parseArgbDigits } from './shared.js';

/**
 * 4- and 8-digit hex only.
 *
 * 3- and 6-digit hex means the same thing in Android as in CSS, so those are left to
 * the CSS pattern. The longer forms are where Android differs: it puts alpha first.
 */
const ANDROID_HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{4})(?![0-9a-fA-F])/g;

/** Raw integer colors appear in Kotlin and Java as well as Dart. */
const BARE_ARGB = /\b0[xX](?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6})(?![0-9a-fA-F])/g;

export function parseAndroidHex(raw: string): Color | null {
  return parseArgbDigits(raw.replace(/^#/, ''));
}

/**
 * Android resource files, identified by path rather than by language.
 *
 * Gating on `xml` alone would be wrong and destructive: an SVG is also XML and uses
 * CSS color semantics, so reading `#FF3B82F6` there as ARGB would silently change the
 * color on every rewrite. Android colors live in a `res/values` directory or in one of
 * the conventional resource filenames, so that is what this checks.
 */
const RESOURCE_PATH = /(^|[/\\])res[/\\]values[^/\\]*[/\\][^/\\]+\.xml$/i;
const RESOURCE_NAME = /(^|[/\\])(colors|themes|styles|attrs|dimens)\.xml$/i;

const JVM_LANGUAGES = new Set(['kotlin', 'java']);

function isResourceFile(context: DialectContext): boolean {
  const path = context.filePath;
  if (!path) return false;
  return RESOURCE_PATH.test(path) || RESOURCE_NAME.test(path);
}

function parseBareArgbForAndroid(raw: string): Color | null {
  const match = /^0[xX]([0-9a-fA-F]+)$/.exec(raw.trim());
  return match ? parseArgbDigits(match[1]!) : null;
}

const PATTERNS: readonly DialectPattern[] = [
  // Above the CSS hex pattern, which covers the same characters with the opposite
  // meaning for these two lengths.
  { notation: 'android-hex', regex: ANDROID_HEX, parse: parseAndroidHex, priority: 30 },
  { notation: 'argb-hex', regex: BARE_ARGB, parse: parseBareArgbForAndroid, priority: 5 }
];

export const androidDialect: Dialect = {
  id: 'android',
  applies: (context: DialectContext) =>
    isResourceFile(context) ||
    (context.languageId !== undefined && JVM_LANGUAGES.has(context.languageId)),
  patterns: PATTERNS
};

/**
 * Which of this dialect's patterns apply to a given file.
 *
 * The ARGB-first hex reading is only ever safe inside an Android resource file. In a
 * Kotlin or Java source file, only the raw integer literals apply.
 */
export function androidPatternsFor(context: DialectContext): readonly DialectPattern[] {
  if (isResourceFile(context)) return PATTERNS;
  return PATTERNS.filter((pattern) => pattern.notation === 'argb-hex');
}
