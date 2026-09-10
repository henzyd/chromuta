import { describe, expect, it } from 'vitest';
import { formatColor, isLossyConversion } from '../../src/core/color/format.js';
import { parseColor } from '../../src/core/color/parse.js';
import type { FormatOptions, OutputNotation } from '../../src/core/color/types.js';

function render(
  input: string,
  notation: OutputNotation,
  options: Partial<FormatOptions> = {}
): string | null {
  const color = parseColor(input);
  if (!color) throw new Error(`unparseable fixture: ${input}`);
  return formatColor(color, notation, options);
}

describe('hex output', () => {
  it('shortens when every pair repeats', () => {
    expect(render('#ffffff', 'hex')).toBe('#fff');
    expect(render('rgb(255 0 0)', 'hex')).toBe('#f00');
  });

  it('keeps longhand when shortening would change the value', () => {
    expect(render('#3b82f6', 'hex')).toBe('#3b82f6');
  });

  it('honors the shorthand setting', () => {
    expect(render('#ffffff', 'hex', { shorthandHex: false })).toBe('#ffffff');
  });

  it('honors hex casing', () => {
    expect(render('#3b82f6', 'hex', { hexCase: 'upper' })).toBe('#3B82F6');
  });

  it('appends an alpha byte', () => {
    expect(render('rgb(255 0 0 / 50%)', 'hex')).toBe('#ff000080');
  });
});

describe('function syntax', () => {
  it('defaults to the modern space-separated form', () => {
    expect(render('#f00', 'rgb')).toBe('rgb(255 0 0)');
    expect(render('#f00', 'hsl')).toBe('hsl(0 100% 50%)');
  });

  it('emits the legacy comma form on request, switching to the rgba spelling for alpha', () => {
    expect(render('#f00', 'rgb', { functionSyntax: 'legacy' })).toBe('rgb(255, 0, 0)');
    // Note the input is not #ff000080: the hex byte 0x80 is 128/255 = 0.502, so a
    // fixture that wants a clean 0.5 has to say so.
    expect(render('rgb(255 0 0 / 0.5)', 'rgb', { functionSyntax: 'legacy' })).toBe('rgba(255, 0, 0, 0.5)');
    expect(render('rgb(255 0 0 / 0.5)', 'hsl', { functionSyntax: 'legacy' })).toBe('hsla(0, 100%, 50%, 0.5)');
  });

  it('omits the space after commas when the file does', () => {
    expect(render('#f00', 'rgb', { functionSyntax: 'legacy', spaceAfterComma: false }))
      .toBe('rgb(255,0,0)');
  });

  it('uses slash-alpha for notations that have no legacy form', () => {
    expect(render('#ff000080', 'oklch', { functionSyntax: 'legacy' })).toContain(' / 0.5');
  });

  it('writes alpha as a percentage on request', () => {
    expect(render('rgb(255 0 0 / 0.5)', 'rgb', { alphaStyle: 'percent' })).toBe('rgb(255 0 0 / 50%)');
    // And the hex byte really does round-trip as 50.2%.
    expect(render('#ff000080', 'rgb', { alphaStyle: 'percent' })).toBe('rgb(255 0 0 / 50.2%)');
  });
});

describe('perceptual output', () => {
  it('round-trips red through oklch', () => {
    const text = render('#f00', 'oklch')!;
    expect(text).toMatch(/^oklch\(/);
    expect(formatColor(parseColor(text)!, 'hex', {})).toBe('#f00');
  });

  it('drops trailing zeros', () => {
    expect(render('#fff', 'oklch')).toBe('oklch(1 0 0)');
  });
});

describe('named output', () => {
  it('returns a keyword only on an exact match', () => {
    expect(render('#ff6347', 'named')).toBe('tomato');
    expect(render('#3b82f6', 'named')).toBeNull();
  });

  it('maps fully transparent to the transparent keyword', () => {
    expect(render('rgb(0 0 0 / 0)', 'named')).toBe('transparent');
  });

  it('refuses partial alpha, which no keyword can express', () => {
    expect(render('rgb(255 99 71 / 50%)', 'named')).toBeNull();
  });
});

describe('gamut reporting', () => {
  const wide = 'oklch(0.7 0.35 150)';

  it('flags sRGB-bound notations as lossy for out-of-gamut colors', () => {
    const color = parseColor(wide)!;
    expect(isLossyConversion(color, 'hex')).toBe(true);
    expect(isLossyConversion(color, 'rgb')).toBe(true);
    expect(isLossyConversion(color, 'hsl')).toBe(true);
    expect(isLossyConversion(color, 'oklch')).toBe(false);
    expect(isLossyConversion(color, 'lab')).toBe(false);
  });

  it('reduces chroma rather than clipping channels', () => {
    const hex = render(wide, 'hex')!;
    const back = parseColor(hex)!;
    // Chroma reduction holds hue, so the clamped color stays green rather than
    // sliding toward whatever a per-channel clip would produce.
    expect(hex).toMatch(/^#[0-9a-f]{3,6}$/);
    expect(back.ok.b).toBeGreaterThan(0);
  });

  it('reports in-gamut colors as safe', () => {
    expect(isLossyConversion(parseColor('#3b82f6')!, 'hex')).toBe(false);
  });
});
