import { describe, expect, it } from 'vitest';
import { formatColor } from '../../src/core/color/format.js';
import { DEFAULT_FORMAT_OPTIONS } from '../../src/core/color/types.js';
import { scanText } from '../../src/core/detect/scanText.js';
import type { ColorMatch, ScanContext } from '../../src/core/detect/types.js';
import type { DialectId } from '../../src/core/dialects/types.js';

const ALL: readonly DialectId[] = ['css', 'tailwind', 'flutter', 'android', 'swift'];

const scan = (text: string, context: ScanContext = {}): ColorMatch[] =>
  scanText(text, { dialects: ALL, ...context });

const rgbOf = (match: ColorMatch): string =>
  formatColor({ ...match.color, alpha: 1 }, 'hex', {
    ...DEFAULT_FORMAT_OPTIONS,
    shorthandHex: false
  })!;

describe('Android resource files', () => {
  const resource: ScanContext = {
    languageId: 'xml',
    filePath: 'app/src/main/res/values/colors.xml'
  };

  it('reads 8-digit hex as alpha-first', () => {
    const [match] = scan('<color name="brand">#FF3B82F6</color>', resource);
    expect(match!.notation).toBe('android-hex');
    expect(rgbOf(match!)).toBe('#3b82f6');
    expect(match!.color.alpha).toBe(1);
  });

  it('leaves 6-digit hex to the CSS pattern, since both agree on it', () => {
    const [match] = scan('<color name="brand">#3B82F6</color>', resource);
    expect(match!.notation).toBe('hex');
    expect(rgbOf(match!)).toBe('#3b82f6');
  });

  it('recognizes a resource file by directory as well as by name', () => {
    const byDir: ScanContext = { languageId: 'xml', filePath: 'res/values-night/my_palette.xml' };
    expect(scan('<color>#FF3B82F6</color>', byDir)[0]!.notation).toBe('android-hex');
  });
});

describe('an SVG is XML but is not Android', () => {
  const svg: ScanContext = { languageId: 'xml', filePath: 'assets/logo.svg' };

  it('reads 8-digit hex with CSS semantics', () => {
    // Reading this as ARGB would silently change the color of every rewrite in every
    // SVG in the repository, which is why the dialect is gated on path, not language.
    const [match] = scan('<path fill="#FF3B82F6"/>', svg);
    expect(match!.notation).toBe('hex');
    expect(rgbOf(match!)).toBe('#ff3b82');
    expect(Math.round(match!.color.alpha * 1000) / 1000).toBe(0.965);
  });

  it('applies the same rule to an ordinary XML file', () => {
    const other: ScanContext = { languageId: 'xml', filePath: 'config/theme.xml' };
    expect(scan('<c>#FF3B82F6</c>', other)[0]!.notation).toBe('hex');
  });
});

describe('Flutter', () => {
  const dart: ScanContext = { languageId: 'dart', filePath: 'lib/theme.dart' };

  it('finds every Flutter color form', () => {
    const source = `
      const brand = Color(0xFF3B82F6);
      final alt = Color.fromARGB(255, 59, 130, 246);
      final third = Color.fromRGBO(59, 130, 246, 1.0);
    `;
    const matches = scan(source, dart);
    expect(matches.map((m) => m.notation)).toEqual(['dart-color', 'dart-argb', 'dart-rgbo']);
    for (const match of matches) expect(rgbOf(match)).toBe('#3b82f6');
  });

  it('claims the whole Color(0x…) call, not just the integer inside it', () => {
    const [match] = scan('const c = Color(0xFF3B82F6);', dart);
    expect(match!.text).toBe('Color(0xFF3B82F6)');
  });

  it('trusts a bare integer when the line reads like it is about color', () => {
    const [match] = scan('const int brandColor = 0xFF3B82F6;', dart);
    expect(match!.notation).toBe('argb-hex');
    expect(match!.confidence).toBe(1);
  });

  it('demotes a bare integer with nothing to suggest it is a color', () => {
    const [match] = scan('const int mask = 0xFF00FF00;', dart);
    expect(match!.confidence).toBeLessThan(0.5);
    expect(match!.flags).toContain('bare integer literal with nothing to suggest it is a color');
  });

  it('finds nothing when the dialect is off', () => {
    expect(scan('const c = Color(0xFF3B82F6);', { ...dart, dialects: ['css'] })).toEqual([]);
  });
});

describe('Swift', () => {
  const swift: ScanContext = { languageId: 'swift', filePath: 'Sources/Theme.swift' };

  it('finds each initializer and labels it with the type it came from', () => {
    const source = `
      let a = UIColor(red: 0.231, green: 0.51, blue: 0.965, alpha: 1.0)
      let b = NSColor(red: 0.231, green: 0.51, blue: 0.965, alpha: 1.0)
      let c = Color(red: 0.231, green: 0.51, blue: 0.965)
      let d = UIColor(white: 0.5, alpha: 1.0)
      let e = UIColor(hue: 0.6, saturation: 0.5, brightness: 0.9, alpha: 1.0)
    `;
    expect(scan(source, swift).map((m) => m.notation)).toEqual([
      'swift-uicolor',
      'swift-nscolor',
      'swift-color',
      'swift-white',
      'swift-hsb'
    ]);
  });

  it('ignores an initializer that names an asset rather than components', () => {
    expect(scan('let c = UIColor(named: "brand")', swift)).toEqual([]);
  });

  it('still finds hex inside a Swift string literal', () => {
    const [match] = scan('let token = "#3b82f6"', swift);
    expect(match!.notation).toBe('hex');
  });
});

describe('Tailwind', () => {
  const html: ScanContext = { languageId: 'html', filePath: 'index.html' };

  it('reads an underscore-separated arbitrary value', () => {
    const [match] = scan('<div class="text-[rgb(59_130_246)]">x</div>', html);
    expect(match!.notation).toBe('tw-rgb');
    expect(rgbOf(match!)).toBe('#3b82f6');
    // The match covers only the function, so the brackets survive the rewrite.
    expect(match!.text).toBe('rgb(59_130_246)');
  });

  it('beats the CSS function pattern, which claims the same span but cannot read it', () => {
    // With the dialect off, the CSS pattern wins the span and then fails to parse, so
    // the color is lost entirely. That is what parsing before overlap resolution fixes.
    expect(
      scan('<div class="text-[rgb(59_130_246)]">x</div>', { ...html, dialects: ['css'] })
    ).toEqual([]);
  });

  it('leaves ordinary bracketed hex to the CSS pattern', () => {
    const [match] = scan('<div class="bg-[#3b82f6]">x</div>', html);
    expect(match!.notation).toBe('hex');
    expect(match!.text).toBe('#3b82f6');
  });

  it('does not treat a normal CSS declaration as a Tailwind value', () => {
    const [match] = scan('a { color: rgb(59 130 246); }', { languageId: 'css' });
    expect(match!.notation).toBe('rgb');
  });
});

describe('mixed files', () => {
  it('keeps CSS and dialect matches side by side without overlapping', () => {
    const source = 'const a = Color(0xFF3B82F6); const b = "#0f172a";';
    const matches = scan(source, { languageId: 'dart', filePath: 'lib/a.dart' });
    expect(matches.map((m) => m.notation)).toEqual(['dart-color', 'hex']);
    for (let i = 1; i < matches.length; i++) {
      expect(matches[i]!.start).toBeGreaterThanOrEqual(matches[i - 1]!.end);
    }
  });

  it('offsets still slice the original text back out', () => {
    const source = 'let c = UIColor(red: 0.2, green: 0.4, blue: 0.8, alpha: 1)';
    const [match] = scan(source, { languageId: 'swift' });
    expect(source.slice(match!.start, match!.end)).toBe(match!.text);
  });
});
