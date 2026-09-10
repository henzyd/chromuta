import { describe, expect, it } from 'vitest';
import {
  hslToRgb,
  labToOkLab,
  okLabToLab,
  okLabToOkLch,
  okLabToRgb,
  okLchToOkLab,
  rgbToHsl,
  rgbToOkLab
} from '../../src/core/color/spaces.js';
import type { Rgb } from '../../src/core/color/types.js';

const close = (a: number, b: number, eps = 1e-6): void => expect(Math.abs(a - b)).toBeLessThan(eps);

describe('sRGB <-> OKLab', () => {
  it('maps white to L=1 with no chroma', () => {
    const ok = rgbToOkLab({ r: 1, g: 1, b: 1 });
    close(ok.L, 1, 1e-5);
    close(ok.a, 0, 1e-5);
    close(ok.b, 0, 1e-5);
  });

  it('maps black to the origin', () => {
    const ok = rgbToOkLab({ r: 0, g: 0, b: 0 });
    close(ok.L, 0, 1e-9);
    close(ok.a, 0, 1e-9);
    close(ok.b, 0, 1e-9);
  });

  it('places pure red at the documented OKLCh coordinates', () => {
    const lch = okLabToOkLch(rgbToOkLab({ r: 1, g: 0, b: 0 }));
    close(lch.L, 0.6279554, 1e-5);
    close(lch.C, 0.2576833, 1e-5);
    close(lch.H, 29.2338, 1e-3);
  });

  it('round-trips a spread of sRGB values', () => {
    const samples: Rgb[] = [
      { r: 0.1, g: 0.2, b: 0.3 },
      { r: 1, g: 0.5, b: 0 },
      { r: 0.5, g: 0.5, b: 0.5 },
      { r: 0.02, g: 0.9, b: 0.4 }
    ];
    for (const rgb of samples) {
      const back = okLabToRgb(rgbToOkLab(rgb));
      close(back.r, rgb.r);
      close(back.g, rgb.g);
      close(back.b, rgb.b);
    }
  });
});

describe('polar forms', () => {
  it('round-trips OKLab through OKLCh', () => {
    const ok = rgbToOkLab({ r: 0.2, g: 0.7, b: 0.4 });
    const back = okLchToOkLab(okLabToOkLch(ok));
    close(back.L, ok.L);
    close(back.a, ok.a);
    close(back.b, ok.b);
  });

  it('pins hue to zero for achromatic colors, where the angle is meaningless', () => {
    expect(okLabToOkLch(rgbToOkLab({ r: 0.5, g: 0.5, b: 0.5 })).H).toBe(0);
  });
});

describe('CIE Lab (D50)', () => {
  it('maps white to L=100', () => {
    const lab = okLabToLab(rgbToOkLab({ r: 1, g: 1, b: 1 }));
    close(lab.L, 100, 1e-3);
    close(lab.a, 0, 1e-3);
    close(lab.b, 0, 1e-3);
  });

  it('round-trips through the D65/D50 adaptation', () => {
    const ok = rgbToOkLab({ r: 0.3, g: 0.6, b: 0.9 });
    const back = labToOkLab(okLabToLab(ok));
    // Four matrix multiplications and two cube roots each way; 1e-7 is well inside
    // a single 8-bit step.
    close(back.L, ok.L, 1e-7);
    close(back.a, ok.a, 1e-7);
    close(back.b, ok.b, 1e-7);
  });
});

describe('HSL', () => {
  it('round-trips', () => {
    const rgb = { r: 0.8, g: 0.2, b: 0.4 };
    const back = hslToRgb(rgbToHsl(rgb));
    close(back.r, rgb.r, 1e-9);
    close(back.g, rgb.g, 1e-9);
    close(back.b, rgb.b, 1e-9);
  });

  it('reports zero saturation for grays', () => {
    expect(rgbToHsl({ r: 0.4, g: 0.4, b: 0.4 }).s).toBe(0);
  });
});
