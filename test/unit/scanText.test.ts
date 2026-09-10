import { describe, expect, it } from 'vitest';
import { scanText } from '../../src/core/detect/scanText.js';
import type { ScanContext } from '../../src/core/detect/types.js';

const css: ScanContext = { languageId: 'css' };
const ts: ScanContext = { languageId: 'typescript' };

const texts = (input: string, context: ScanContext = css): string[] =>
  scanText(input, context).map((m) => m.text);

/** Matches at or above the default 0.5 threshold, i.e. what bulk edits would touch. */
const confident = (input: string, context: ScanContext = css): string[] =>
  scanText(input, context)
    .filter((m) => m.confidence >= 0.5)
    .map((m) => m.text);

describe('finds color literals', () => {
  it('detects hex in a declaration', () => {
    expect(texts('a { color: #fff; background: #3B82F6; }')).toEqual(['#fff', '#3B82F6']);
  });

  it('detects every functional notation', () => {
    const input = `
      .a { color: rgb(255 0 0); }
      .b { color: rgba(0, 0, 0, .5); }
      .c { color: hsl(210 40% 96%); }
      .d { color: oklch(0.7 0.15 200); }
      .e { color: lab(50 20 -30); }
      .f { color: color(display-p3 1 0 0); }
    `;
    expect(texts(input)).toEqual([
      'rgb(255 0 0)',
      'rgba(0, 0, 0, .5)',
      'hsl(210 40% 96%)',
      'oklch(0.7 0.15 200)',
      'lab(50 20 -30)',
      'color(display-p3 1 0 0)'
    ]);
  });

  it('reports the notation the parser identified, not the coarse pattern class', () => {
    const matches = scanText('a { color: oklch(0.7 0.15 200); }', css);
    expect(matches[0]?.notation).toBe('oklch');
  });

  it('records offsets that slice back to the original text', () => {
    const input = 'a { color: #3b82f6; }';
    const match = scanText(input, css)[0]!;
    expect(input.slice(match.start, match.end)).toBe('#3b82f6');
  });
});

describe('rejects near-misses outright', () => {
  it('ignores a seven-digit hex run rather than truncating it to six', () => {
    expect(texts('a { color: #1234567; }')).toEqual([]);
  });

  it('ignores two- and five-digit runs', () => {
    expect(texts('#ff #fffff')).toEqual([]);
  });

  it('drops function calls it cannot parse', () => {
    expect(texts('a { color: rgb(calc(1px) 0 0); }')).toEqual([]);
    expect(texts('a { color: color(rec2020 1 0 0); }')).toEqual([]);
  });
});

describe('confidence scoring', () => {
  it('scores a plain declaration at full confidence', () => {
    expect(scanText('a { color: #3b82f6; }', css)[0]?.confidence).toBe(1);
  });

  it('rejects the #def inside a C preprocessor directive', () => {
    const matches = scanText('#define FOO 1', { languageId: 'c' });
    expect(matches.map((m) => m.text)).toEqual(['#def']);
    expect(matches[0]!.confidence).toBe(0);
    expect(confident('#define FOO 1', { languageId: 'c' })).toEqual([]);
  });

  it('demotes what looks like a revision hash', () => {
    const match = scanText('// see commit #a1b2c3 for details', ts)[0]!;
    expect(match.confidence).toBeLessThan(0.5);
    expect(match.flags).toContain('looks like a revision hash');
  });

  it('demotes a URL fragment', () => {
    const match = scanText('<a href="#abc123">x</a>', { languageId: 'html' })[0]!;
    expect(match.confidence).toBeLessThan(0.5);
  });

  it('demotes a private class field', () => {
    const match = scanText('class A { #abc = 1; }', ts)[0]!;
    expect(match.confidence).toBeLessThan(0.5);
  });

  it('demotes but keeps colors inside comments', () => {
    const match = scanText('/* brand color is #3b82f6 */', css)[0]!;
    expect(match.confidence).toBeGreaterThan(0.5);
    expect(match.flags).toContain('inside a comment');
  });

  it('does not treat the slashes in a URL as a comment', () => {
    const match = scanText('a { background: url(https://x.test/i.png); color: #3b82f6; }', css)[0]!;
    expect(match.flags).not.toContain('inside a comment');
  });

  it('demotes matches in snapshots and fixtures', () => {
    const match = scanText('#3b82f6', {
      languageId: 'css',
      filePath: 'src/__snapshots__/a.snap'
    })[0]!;
    expect(match.confidence).toBeLessThan(1);
    expect(match.flags).toContain('test fixture or snapshot');
  });
});

describe('named colors', () => {
  it('accepts a keyword in a stylesheet value position', () => {
    expect(confident('a { color: tomato; }')).toEqual(['tomato']);
  });

  it('prefers the longest keyword', () => {
    expect(texts('a { color: darkgray; }')).toEqual(['darkgray']);
    expect(texts('a { color: greenyellow; }')).toEqual(['greenyellow']);
  });

  it('demotes a keyword outside a stylesheet', () => {
    const match = scanText('const tomato = 1;', ts)[0]!;
    expect(match.confidence).toBeLessThan(0.5);
  });

  it('demotes a keyword that is not in a value position', () => {
    const match = scanText('.red { padding: 0 }', css)[0]!;
    expect(match.flags).toContain('not in a property-value position');
  });

  it('skips keywords entirely when disabled', () => {
    expect(texts('a { color: tomato; }', { languageId: 'css', namedColors: false })).toEqual([]);
  });
});

describe('overlap resolution', () => {
  it('does not emit a keyword nested inside a longer literal', () => {
    // `red` sits inside `mediumvioletred`; only the outer keyword survives.
    expect(texts('a { color: mediumvioletred; }')).toEqual(['mediumvioletred']);
  });

  it('produces non-overlapping, ordered matches', () => {
    const matches = scanText('a{color:#fff;border:1px solid rgb(0 0 0);background:tomato}', css);
    for (let i = 1; i < matches.length; i++) {
      expect(matches[i]!.start).toBeGreaterThanOrEqual(matches[i - 1]!.end);
    }
  });
});
