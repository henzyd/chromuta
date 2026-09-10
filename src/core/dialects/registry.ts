import type { ColorNotation, DialectOutputNotation } from '../color/types.js';
import { androidDialect, androidPatternsFor } from './android.js';
import { flutterDialect } from './flutter.js';
import { swiftDialect } from './swift.js';
import { tailwindDialect } from './tailwind.js';
import type { Dialect, DialectContext, DialectId, DialectPattern } from './types.js';

export const DIALECTS: readonly Dialect[] = [
  tailwindDialect,
  flutterDialect,
  androidDialect,
  swiftDialect
];

/** Which non-CSS dialects are switched on and apply to this file. */
export function activeDialects(
  context: DialectContext,
  enabled: readonly DialectId[]
): readonly Dialect[] {
  const on = new Set(enabled);
  return DIALECTS.filter((dialect) => on.has(dialect.id) && dialect.applies(context));
}

/** Every dialect pattern that should run against this file. */
export function dialectPatternsFor(
  context: DialectContext,
  enabled: readonly DialectId[]
): readonly DialectPattern[] {
  const patterns: DialectPattern[] = [];

  for (const dialect of activeDialects(context, enabled)) {
    // Android narrows further by path: its alpha-first hex reading is only safe
    // inside an actual resource file, never in an SVG that happens to be XML.
    const own = dialect.id === 'android' ? androidPatternsFor(context) : dialect.patterns;
    patterns.push(...own);
  }

  return patterns;
}

const NOTATIONS_BY_DIALECT: Readonly<Record<DialectId, readonly DialectOutputNotation[]>> = {
  css: [],
  tailwind: ['tw-rgb', 'tw-hsl', 'tw-oklch'],
  flutter: ['dart-color', 'dart-argb', 'dart-rgbo', 'argb-hex'],
  android: ['android-hex', 'argb-hex'],
  swift: ['swift-uicolor', 'swift-nscolor', 'swift-color']
};

/** Dialect notations worth offering as conversion targets in this file. */
export function dialectNotationsFor(
  context: DialectContext,
  enabled: readonly DialectId[]
): readonly DialectOutputNotation[] {
  const result: DialectOutputNotation[] = [];

  for (const dialect of activeDialects(context, enabled)) {
    for (const notation of NOTATIONS_BY_DIALECT[dialect.id]) {
      if (!result.includes(notation)) result.push(notation);
    }
  }

  // Android's alpha-first hex is only correct inside a resource file. Offering it
  // elsewhere would write a value the file's own parser reads differently.
  if (!androidPatternsFor(context).some((p) => p.notation === 'android-hex')) {
    return result.filter((notation) => notation !== 'android-hex');
  }

  return result;
}

/** The dialect a notation belongs to, used to offer same-idiom conversions first. */
export function dialectOf(notation: ColorNotation): DialectId {
  if (notation.startsWith('tw-')) return 'tailwind';
  if (notation.startsWith('swift-')) return 'swift';
  if (notation.startsWith('dart-')) return 'flutter';
  if (notation === 'android-hex') return 'android';
  // A raw ARGB integer is shared between Flutter and Android; Flutter is the more
  // common home for it and the choice only affects ordering.
  if (notation === 'argb-hex') return 'flutter';
  return 'css';
}
