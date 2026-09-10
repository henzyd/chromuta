import { formatColor } from '../color/format.js';
import type { DialectOutputNotation, Color, FormatOptions } from '../color/types.js';
import { encodeTailwindValue } from './tailwind.js';
import { argbDigits, num, toBytes, toUnits } from './shared.js';

/**
 * Write a color in a platform notation.
 *
 * The point of these is that a rewrite stays in the idiom of the file. Converting a
 * `Color(0xFF3B82F6)` in a Dart file should produce another Dart color, not a hex
 * string the Dart compiler will reject.
 */
export function formatDialectColor(
  color: Color,
  notation: DialectOutputNotation,
  options: FormatOptions
): string | null {
  switch (notation) {
    case 'argb-hex':
      return `0x${argbDigits(color, options.hexCase)}`;

    case 'android-hex':
      return `#${argbDigits(color, options.hexCase)}`;

    case 'dart-color':
      return `Color(0x${argbDigits(color, options.hexCase)})`;

    case 'dart-argb': {
      const { a, r, g, b } = toBytes(color);
      return `Color.fromARGB(${a}, ${r}, ${g}, ${b})`;
    }

    case 'dart-rgbo': {
      const { r, g, b } = toBytes(color);
      // fromRGBO's fourth argument is opacity as a double, not a byte.
      return `Color.fromRGBO(${r}, ${g}, ${b}, ${num(color.alpha, Math.max(options.precision, 2))})`;
    }

    case 'swift-uicolor':
      return swiftRgb('UIColor', color, options, 'alpha');

    case 'swift-nscolor':
      return swiftRgb('NSColor', color, options, 'alpha');

    case 'swift-color':
      return swiftRgb('Color', color, options, 'opacity');

    case 'tw-rgb':
      return tailwind(color, 'rgb', options);

    case 'tw-hsl':
      return tailwind(color, 'hsl', options);

    case 'tw-oklch':
      return tailwind(color, 'oklch', options);
  }
}

/**
 * Swift initializers take 0-1 floats. Three decimals is finer than an 8-bit step, so
 * the value round-trips through hex without drifting.
 */
function swiftRgb(
  constructor: string,
  color: Color,
  options: FormatOptions,
  alphaLabel: 'alpha' | 'opacity'
): string {
  const { r, g, b, a } = toUnits(color);
  const precision = Math.max(options.precision, 3);
  const channels = `red: ${num(r, precision)}, green: ${num(g, precision)}, blue: ${num(b, precision)}`;

  // UIColor requires alpha; SwiftUI's Color takes opacity only when it is not 1.
  if (alphaLabel === 'alpha') {
    return `${constructor}(${channels}, alpha: ${num(a, precision)})`;
  }
  return a < 1
    ? `${constructor}(${channels}, opacity: ${num(a, precision)})`
    : `${constructor}(${channels})`;
}

/**
 * A Tailwind class name cannot contain a space, so the CSS value is written with
 * underscores instead. Skipping this step produces a class Tailwind silently ignores.
 */
function tailwind(
  color: Color,
  inner: 'rgb' | 'hsl' | 'oklch',
  options: FormatOptions
): string | null {
  // Legacy comma syntax would also be valid here, but modern syntax keeps the value
  // readable once the spaces become underscores.
  const text = formatColor(color, inner, { ...options, functionSyntax: 'modern' });
  return text === null ? null : encodeTailwindValue(text);
}
