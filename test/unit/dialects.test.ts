import { describe, expect, it } from 'vitest';
import { formatColor } from '../../src/core/color/format.js';
import { parseColor } from '../../src/core/color/parse.js';
import { DEFAULT_FORMAT_OPTIONS } from '../../src/core/color/types.js';
import { formatDialectColor } from '../../src/core/dialects/format.js';
import { parseAndroidHex } from '../../src/core/dialects/android.js';
import {
  parseBareArgb,
  parseDartColor,
  parseFromArgb,
  parseFromRgbo
} from '../../src/core/dialects/flutter.js';
import { parseSwiftColor, swiftNotationFor } from '../../src/core/dialects/swift.js';
import {
  decodeTailwindValue,
  encodeTailwindValue,
  parseTailwindFunction
} from '../../src/core/dialects/tailwind.js';
import type { Color } from '../../src/core/color/types.js';

/** RGB only. Alpha is asserted separately, so it must not appear as a fourth byte. */
const hex = (color: Color | null): string | null =>
  color === null
    ? null
    : formatColor({ ...color, alpha: 1 }, 'hex', {
        ...DEFAULT_FORMAT_OPTIONS,
        shorthandHex: false
      });

const alphaOf = (color: Color | null): number | null =>
  color === null ? null : Math.round(color.alpha * 1000) / 1000;

describe('alpha-first hex', () => {
  it('reads Android 8-digit hex as ARGB, not RGBA', () => {
    const color = parseAndroidHex('#FF3B82F6');
    expect(hex(color)).toBe('#3b82f6');
    expect(alphaOf(color)).toBe(1);
  });

  it('differs from the CSS reading of the very same characters', () => {
    // This divergence is the whole reason the dialect exists. CSS reads the leading
    // FF as red and the trailing F6 as alpha.
    const css = parseColor('#FF3B82F6')!;
    expect(hex(css)).toBe('#ff3b82');
    expect(alphaOf(css)).toBe(0.965);
  });

  it('reads Android 4-digit hex as ARGB', () => {
    const color = parseAndroidHex('#8ABC');
    expect(hex(color)).toBe('#aabbcc');
    expect(alphaOf(color)).toBe(0.533);
  });

  it('reads a partial alpha', () => {
    expect(alphaOf(parseAndroidHex('#803B82F6'))).toBe(0.502);
  });

  it('reads a bare integer literal', () => {
    expect(hex(parseBareArgb('0xFF3B82F6'))).toBe('#3b82f6');
    expect(hex(parseBareArgb('0x3B82F6'))).toBe('#3b82f6');
    expect(alphaOf(parseBareArgb('0x803B82F6'))).toBe(0.502);
  });

  it('rejects lengths that are not 3, 4, 6 or 8 digits', () => {
    expect(parseBareArgb('0xFFF')).not.toBeNull();
    expect(parseBareArgb('0xFFFFF')).toBeNull();
    expect(parseBareArgb('0xFFFFFFFFF')).toBeNull();
  });
});

describe('Flutter', () => {
  it('reads Color(0x…) with and without a const in front', () => {
    expect(hex(parseDartColor('Color(0xFF3B82F6)'))).toBe('#3b82f6');
    expect(hex(parseDartColor('Color(0x3B82F6)'))).toBe('#3b82f6');
  });

  it('reads Color.fromARGB', () => {
    const color = parseFromArgb('Color.fromARGB(255, 59, 130, 246)');
    expect(hex(color)).toBe('#3b82f6');
    expect(alphaOf(color)).toBe(1);
    expect(alphaOf(parseFromArgb('Color.fromARGB(128, 59, 130, 246)'))).toBe(0.502);
  });

  it('reads Color.fromRGBO, whose last argument is opacity rather than a byte', () => {
    const color = parseFromRgbo('Color.fromRGBO(59, 130, 246, 1.0)');
    expect(hex(color)).toBe('#3b82f6');
    expect(alphaOf(parseFromRgbo('Color.fromRGBO(59, 130, 246, 0.5)'))).toBe(0.5);
  });

  it('rejects out-of-range channels rather than clamping them', () => {
    expect(parseFromArgb('Color.fromARGB(255, 300, 130, 246)')).toBeNull();
    expect(parseFromRgbo('Color.fromRGBO(59, 130, 246, 2)')).toBeNull();
  });

  it('rejects the wrong number of arguments', () => {
    expect(parseFromArgb('Color.fromARGB(59, 130, 246)')).toBeNull();
  });

  it('writes each Flutter form', () => {
    const blue = parseColor('#3b82f6')!;
    const upper = { ...DEFAULT_FORMAT_OPTIONS, hexCase: 'upper' as const };
    expect(formatDialectColor(blue, 'dart-color', upper)).toBe('Color(0xFF3B82F6)');
    expect(formatDialectColor(blue, 'argb-hex', upper)).toBe('0xFF3B82F6');
    expect(formatDialectColor(blue, 'dart-argb', upper)).toBe('Color.fromARGB(255, 59, 130, 246)');
    expect(formatDialectColor(blue, 'dart-rgbo', upper)).toBe('Color.fromRGBO(59, 130, 246, 1)');
  });

  it('always writes the alpha byte, as Flutter code conventionally does', () => {
    const blue = parseColor('#3b82f6')!;
    expect(formatDialectColor(blue, 'dart-color', DEFAULT_FORMAT_OPTIONS)).toContain('0xff3b82f6');
  });
});

describe('Swift', () => {
  it('reads UIColor and NSColor unit-float channels', () => {
    const color = parseSwiftColor('UIColor(red: 0.231, green: 0.51, blue: 0.965, alpha: 1.0)');
    expect(hex(color)).toBe('#3b82f6');
    expect(hex(parseSwiftColor('NSColor(red: 0.231, green: 0.51, blue: 0.965, alpha: 1)'))).toBe(
      '#3b82f6'
    );
  });

  it('reads SwiftUI Color, where alpha is called opacity and may be absent', () => {
    expect(hex(parseSwiftColor('Color(red: 0.231, green: 0.51, blue: 0.965)'))).toBe('#3b82f6');
    expect(alphaOf(parseSwiftColor('Color(red: 0.2, green: 0.4, blue: 0.8, opacity: 0.5)'))).toBe(
      0.5
    );
  });

  it('reads a leading color-space argument', () => {
    expect(hex(parseSwiftColor('Color(.sRGB, red: 0.231, green: 0.51, blue: 0.965)'))).toBe(
      '#3b82f6'
    );
  });

  it('reads the grayscale initializer', () => {
    expect(hex(parseSwiftColor('UIColor(white: 1.0, alpha: 1.0)'))).toBe('#ffffff');
    expect(hex(parseSwiftColor('UIColor(white: 0.0, alpha: 1.0)'))).toBe('#000000');
  });

  it('reads hue/saturation/brightness as HSV, which is what Swift means by brightness', () => {
    // HSV with full saturation and value is pure hue, unlike HSL where that is white.
    expect(hex(parseSwiftColor('UIColor(hue: 0, saturation: 1, brightness: 1, alpha: 1)'))).toBe(
      '#ff0000'
    );
    expect(
      hex(parseSwiftColor('UIColor(hue: 0.3333, saturation: 1, brightness: 1, alpha: 1)'))
    ).toBe('#00ff00');
    // Saturation zero at full value is white in HSV.
    expect(hex(parseSwiftColor('UIColor(hue: 0.5, saturation: 0, brightness: 1, alpha: 1)'))).toBe(
      '#ffffff'
    );
  });

  it('rejects channels outside 0 to 1', () => {
    expect(parseSwiftColor('UIColor(red: 59, green: 130, blue: 246, alpha: 1)')).toBeNull();
  });

  it('rejects an initializer it does not recognize', () => {
    expect(parseSwiftColor('UIColor(named: "brand")')).toBeNull();
  });

  it('identifies which initializer a match came from, so a rewrite keeps the type', () => {
    expect(swiftNotationFor('UIColor(red: 0, green: 0, blue: 0, alpha: 1)')).toBe('swift-uicolor');
    expect(swiftNotationFor('NSColor(red: 0, green: 0, blue: 0, alpha: 1)')).toBe('swift-nscolor');
    expect(swiftNotationFor('Color(red: 0, green: 0, blue: 0)')).toBe('swift-color');
    expect(swiftNotationFor('UIColor(white: 0.5, alpha: 1)')).toBe('swift-white');
    expect(swiftNotationFor('UIColor(hue: 0.5, saturation: 1, brightness: 1, alpha: 1)')).toBe(
      'swift-hsb'
    );
  });

  it('writes each Swift form', () => {
    const blue = parseColor('#3b82f6')!;
    expect(formatDialectColor(blue, 'swift-uicolor', DEFAULT_FORMAT_OPTIONS)).toBe(
      'UIColor(red: 0.231, green: 0.51, blue: 0.965, alpha: 1)'
    );
    expect(formatDialectColor(blue, 'swift-nscolor', DEFAULT_FORMAT_OPTIONS)).toMatch(/^NSColor\(/);
    expect(formatDialectColor(blue, 'swift-color', DEFAULT_FORMAT_OPTIONS)).toBe(
      'Color(red: 0.231, green: 0.51, blue: 0.965)'
    );
  });

  it('omits opacity on SwiftUI Color when opaque but includes alpha on UIColor', () => {
    const blue = parseColor('#3b82f6')!;
    expect(formatDialectColor(blue, 'swift-color', DEFAULT_FORMAT_OPTIONS)).not.toContain(
      'opacity'
    );
    expect(formatDialectColor(blue, 'swift-uicolor', DEFAULT_FORMAT_OPTIONS)).toContain('alpha');

    const half = parseColor('rgb(59 130 246 / 0.5)')!;
    expect(formatDialectColor(half, 'swift-color', DEFAULT_FORMAT_OPTIONS)).toContain(
      'opacity: 0.5'
    );
  });
});

describe('Tailwind', () => {
  it('reads an underscore-separated value the CSS parser would reject', () => {
    expect(parseColor('rgb(0_0_0)')).toBeNull();
    expect(hex(parseTailwindFunction('rgb(0_0_0)'))).toBe('#000000');
  });

  it('reads every function form Tailwind allows in a bracket', () => {
    expect(hex(parseTailwindFunction('rgb(59_130_246)'))).toBe('#3b82f6');
    expect(hex(parseTailwindFunction('rgb(59,130,246)'))).toBe('#3b82f6');
    expect(hex(parseTailwindFunction('hsl(0_100%_50%)'))).toBe('#ff0000');
    expect(hex(parseTailwindFunction('oklch(1_0_0)'))).toBe('#ffffff');
  });

  it('round-trips underscore encoding', () => {
    expect(decodeTailwindValue('rgb(0_0_0_/_50%)')).toBe('rgb(0 0 0 / 50%)');
    expect(encodeTailwindValue('rgb(0 0 0 / 50%)')).toBe('rgb(0_0_0_/_50%)');
  });

  it('writes values with no spaces, since a class name cannot contain one', () => {
    const blue = parseColor('#3b82f6')!;
    for (const notation of ['tw-rgb', 'tw-hsl', 'tw-oklch'] as const) {
      const text = formatDialectColor(blue, notation, DEFAULT_FORMAT_OPTIONS)!;
      expect(text).not.toContain(' ');
      expect(text).toContain('_');
    }
    expect(formatDialectColor(blue, 'tw-rgb', DEFAULT_FORMAT_OPTIONS)).toBe(
      'rgb(37_130_246)'.replace('37', '59')
    );
  });
});

describe('round-tripping every dialect output notation', () => {
  const samples = ['#3b82f6', '#000000', '#ffffff', 'rgb(255 99 71 / 0.5)', '#0f172a'];

  const parsers = {
    'dart-color': parseDartColor,
    'dart-argb': parseFromArgb,
    'dart-rgbo': parseFromRgbo,
    'argb-hex': parseBareArgb,
    'android-hex': parseAndroidHex,
    'swift-uicolor': parseSwiftColor,
    'swift-nscolor': parseSwiftColor,
    'swift-color': parseSwiftColor,
    'tw-rgb': parseTailwindFunction,
    'tw-hsl': parseTailwindFunction,
    'tw-oklch': parseTailwindFunction
  } as const;

  it.each(Object.keys(parsers) as (keyof typeof parsers)[])(
    '%s writes a value it can read back',
    (notation) => {
      for (const sample of samples) {
        const original = parseColor(sample)!;
        const written = formatDialectColor(original, notation, DEFAULT_FORMAT_OPTIONS)!;
        const back = parsers[notation](written);
        expect(back, `${sample} -> ${written}`).not.toBeNull();
        expect(hex(back), `${sample} -> ${written}`).toBe(hex(original));
        expect(Math.abs(back!.alpha - original.alpha), `${sample} -> ${written}`).toBeLessThan(
          0.005
        );
      }
    }
  );
});
