import { describe, expect, it } from 'vitest';
import { DEFAULT_FORMAT_OPTIONS, type OutputNotation } from '../../src/core/color/types.js';
import { parseColor } from '../../src/core/color/parse.js';
import {
  formatAny,
  isLossyAny,
  notationLabel,
  notationsForMatch
} from '../../src/core/notation.js';
import { dialectOf } from '../../src/core/dialects/registry.js';
import type { DialectId } from '../../src/core/dialects/types.js';

const CSS: readonly OutputNotation[] = ['hex', 'rgb', 'hsl', 'oklch'];
const ALL: readonly DialectId[] = ['css', 'tailwind', 'flutter', 'android', 'swift'];

describe('the single format entry point', () => {
  it('handles CSS and dialect notations alike', () => {
    const blue = parseColor('#3b82f6')!;
    expect(formatAny(blue, 'hex', DEFAULT_FORMAT_OPTIONS)).toBe('#3b82f6');
    expect(formatAny(blue, 'dart-color', DEFAULT_FORMAT_OPTIONS)).toBe('Color(0xff3b82f6)');
  });

  it('treats every dialect notation as sRGB-bound for gamut purposes', () => {
    const wide = parseColor('oklch(0.7 0.35 150)')!;
    expect(isLossyAny(wide, 'dart-color')).toBe(true);
    expect(isLossyAny(wide, 'swift-uicolor')).toBe(true);
    expect(isLossyAny(wide, 'tw-oklch')).toBe(true);
    expect(isLossyAny(wide, 'oklch')).toBe(false);
  });

  it('labels notations readably, since the ids are not self-explaining', () => {
    expect(notationLabel('dart-rgbo')).toBe('Flutter Color.fromRGBO');
    expect(notationLabel('android-hex')).toBe('Android #AARRGGBB');
    expect(notationLabel('hex')).toBe('hex');
  });
});

describe('grouping notations by idiom', () => {
  it.each([
    ['dart-color', 'flutter'],
    ['dart-argb', 'flutter'],
    ['argb-hex', 'flutter'],
    ['android-hex', 'android'],
    ['swift-uicolor', 'swift'],
    ['swift-hsb', 'swift'],
    ['tw-oklch', 'tailwind'],
    ['hex', 'css'],
    ['oklch', 'css']
  ] as const)('%s belongs to %s', (notation, dialect) => {
    expect(dialectOf(notation)).toBe(dialect);
  });
});

describe('conversion targets offered for a match', () => {
  const dart = { languageId: 'dart', filePath: 'lib/theme.dart' };
  const swift = { languageId: 'swift', filePath: 'Theme.swift' };
  const css = { languageId: 'css', filePath: 'a.css' };

  it('leads with the same idiom for a Flutter literal', () => {
    const offered = notationsForMatch('dart-color', dart, ALL, CSS);
    expect(offered.slice(0, 4)).toEqual(['dart-color', 'dart-argb', 'dart-rgbo', 'argb-hex']);
  });

  it('still offers CSS notations after the platform ones', () => {
    expect(notationsForMatch('dart-color', dart, ALL, CSS)).toContain('hex');
  });

  it('leads with CSS for a hex literal in the same Flutter file', () => {
    // A hex string inside Dart source is a CSS color; offering Color(0x…) first would
    // be wrong for it even though the file is Dart.
    const offered = notationsForMatch('hex', dart, ALL, CSS);
    expect(offered.slice(0, 4)).toEqual(CSS);
    expect(offered).toContain('dart-color');
  });

  it('offers only CSS notations in a plain stylesheet', () => {
    expect(notationsForMatch('hex', css, ALL, CSS)).toEqual(CSS);
  });

  it('offers Swift forms in a Swift file, including for the read-only initializers', () => {
    const offered = notationsForMatch('swift-hsb', swift, ALL, CSS);
    expect(offered.slice(0, 3)).toEqual(['swift-uicolor', 'swift-nscolor', 'swift-color']);
  });

  it('withholds Android alpha-first hex outside a resource file', () => {
    // Writing #AARRGGBB into a Kotlin string would be read back as CSS RGBA.
    const kotlin = { languageId: 'kotlin', filePath: 'src/Theme.kt' };
    expect(notationsForMatch('hex', kotlin, ALL, CSS)).not.toContain('android-hex');
    expect(notationsForMatch('hex', kotlin, ALL, CSS)).toContain('argb-hex');
  });

  it('offers Android hex inside a resource file', () => {
    const resource = { languageId: 'xml', filePath: 'res/values/colors.xml' };
    expect(notationsForMatch('android-hex', resource, ALL, CSS)).toContain('android-hex');
  });

  it('offers nothing extra when the dialects are switched off', () => {
    expect(notationsForMatch('hex', dart, ['css'], CSS)).toEqual(CSS);
  });

  it('never repeats a notation', () => {
    const offered = notationsForMatch('argb-hex', dart, ALL, CSS);
    expect(new Set(offered).size).toBe(offered.length);
  });
});
