import { describe, expect, it } from 'vitest';
import { parseColor } from '../../src/core/color/parse.js';
import { okLabToRgb } from '../../src/core/color/spaces.js';

/** Parse and read back as 0-255 sRGB, which is how most expectations are stated. */
function bytes(text: string): [number, number, number, number] | null {
  const color = parseColor(text);
  if (!color) return null;
  const rgb = okLabToRgb(color.ok);
  // `+ 0` normalizes -0, which Math.round yields for tiny negatives and which
  // toEqual treats as distinct from 0.
  const b = (v: number): number => Math.round(v * 255) + 0;
  return [b(rgb.r), b(rgb.g), b(rgb.b), Math.round(color.alpha * 100) / 100];
}

describe('hex', () => {
  it.each([
    ['#fff', [255, 255, 255, 1]],
    ['#FFF', [255, 255, 255, 1]],
    ['#000', [0, 0, 0, 1]],
    ['#ff0000', [255, 0, 0, 1]],
    ['#3b82f6', [59, 130, 246, 1]],
    ['#f008', [255, 0, 0, 0.53]],
    ['#ff000080', [255, 0, 0, 0.5]]
  ])('parses %s', (input, expected) => {
    expect(bytes(input)).toEqual(expected);
  });

  it.each(['#ff', '#fffff', '#1234567', '#ggg', '#'])('rejects %s', (input) => {
    expect(parseColor(input)).toBeNull();
  });
});

describe('rgb', () => {
  it.each([
    ['rgb(255 0 0)', [255, 0, 0, 1]],
    ['rgb(255, 0, 0)', [255, 0, 0, 1]],
    ['rgba(255, 0, 0, 0.5)', [255, 0, 0, 0.5]],
    ['rgba(255,0,0,.5)', [255, 0, 0, 0.5]],
    ['rgb(255 0 0 / 50%)', [255, 0, 0, 0.5]],
    ['rgb(100% 0% 0%)', [255, 0, 0, 1]],
    ['RGB(0 128 0)', [0, 128, 0, 1]],
    ['rgb(none 128 none)', [0, 128, 0, 1]]
  ])('parses %s', (input, expected) => {
    expect(bytes(input)).toEqual(expected);
  });

  it('rejects nested functions rather than guessing', () => {
    expect(parseColor('rgb(calc(1 + 1) 0 0)')).toBeNull();
  });
});

describe('hsl and hwb', () => {
  it.each([
    ['hsl(0 100% 50%)', [255, 0, 0, 1]],
    ['hsl(0, 100%, 50%)', [255, 0, 0, 1]],
    ['hsla(120, 100%, 50%, 0.5)', [0, 255, 0, 0.5]],
    ['hsl(0.5turn 100% 50%)', [0, 255, 255, 1]],
    ['hsl(200grad 100% 50%)', [0, 255, 255, 1]],
    ['hwb(0 0% 0%)', [255, 0, 0, 1]],
    ['hwb(0 100% 0%)', [255, 255, 255, 1]]
  ])('parses %s', (input, expected) => {
    expect(bytes(input)).toEqual(expected);
  });
});

describe('perceptual notations', () => {
  it('parses oklch and preserves its notation', () => {
    const color = parseColor('oklch(0.6279554 0.2576833 29.2338)');
    expect(color).not.toBeNull();
    expect(color!.source?.notation).toBe('oklch');
    expect(bytes('oklch(0.6279554 0.2576833 29.2338)')).toEqual([255, 0, 0, 1]);
  });

  it('accepts a percentage lightness', () => {
    expect(bytes('oklch(100% 0 0)')).toEqual([255, 255, 255, 1]);
  });

  it('parses oklab, lab and lch', () => {
    expect(bytes('oklab(1 0 0)')).toEqual([255, 255, 255, 1]);
    expect(bytes('lab(100 0 0)')).toEqual([255, 255, 255, 1]);
    expect(bytes('lch(100 0 0)')).toEqual([255, 255, 255, 1]);
  });

  it('keeps out-of-gamut values instead of clipping at parse time', () => {
    const color = parseColor('oklch(0.7 0.35 150)');
    expect(color).not.toBeNull();
    const rgb = okLabToRgb(color!.ok);
    expect(Math.max(rgb.r, rgb.g, rgb.b) > 1 || Math.min(rgb.r, rgb.g, rgb.b) < 0).toBe(true);
  });
});

describe('color()', () => {
  it.each([
    ['color(srgb 1 0 0)', [255, 0, 0, 1]],
    ['color(srgb-linear 1 1 1)', [255, 255, 255, 1]],
    ['color(display-p3 1 1 1)', [255, 255, 255, 1]],
    ['color(xyz-d65 1 1 1)', null]
  ])('parses %s', (input, expected) => {
    if (expected === null) expect(parseColor(input)).not.toBeNull();
    else expect(bytes(input)).toEqual(expected);
  });

  it('rejects unsupported spaces rather than approximating them', () => {
    expect(parseColor('color(rec2020 1 0 0)')).toBeNull();
    expect(parseColor('color(prophoto-rgb 1 0 0)')).toBeNull();
  });
});

describe('keywords', () => {
  it.each([
    ['red', [255, 0, 0, 1]],
    ['TOMATO', [255, 99, 71, 1]],
    ['rebeccapurple', [102, 51, 153, 1]],
    ['transparent', [0, 0, 0, 0]]
  ])('parses %s', (input, expected) => {
    expect(bytes(input)).toEqual(expected);
  });

  it('rejects non-colors', () => {
    expect(parseColor('reddish')).toBeNull();
    expect(parseColor('background')).toBeNull();
  });
});
