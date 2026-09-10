import { okLabToRgb, okLchToOkLab, okLabToOkLch } from './spaces.js';
import type { OkLab, Rgb } from './types.js';

const TOLERANCE = 1e-5;

export function isInSrgbGamut(ok: OkLab): boolean {
  const rgb = okLabToRgb(ok);
  return (
    rgb.r >= -TOLERANCE && rgb.r <= 1 + TOLERANCE &&
    rgb.g >= -TOLERANCE && rgb.g <= 1 + TOLERANCE &&
    rgb.b >= -TOLERANCE && rgb.b <= 1 + TOLERANCE
  );
}

/**
 * Bring an out-of-gamut color into sRGB by reducing chroma while holding
 * lightness and hue, then clipping the residual rounding error.
 *
 * Converting a wide-gamut literal into hex is lossy by definition. Callers that
 * care should test `isInSrgbGamut` first and warn, rather than letting this
 * silently alter a value the user did not ask to change.
 */
export function clampToSrgbGamut(ok: OkLab): Rgb {
  if (isInSrgbGamut(ok)) return clip(okLabToRgb(ok));

  const lch = okLabToOkLch(ok);

  // Anything at or beyond the lightness extremes has no chroma to give back.
  if (lch.L >= 1) return { r: 1, g: 1, b: 1 };
  if (lch.L <= 0) return { r: 0, g: 0, b: 0 };

  // Binary search the largest chroma that stays in gamut. 24 iterations puts the
  // result well below one 8-bit step.
  let lo = 0;
  let hi = lch.C;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (isInSrgbGamut(okLchToOkLab({ L: lch.L, C: mid, H: lch.H }))) lo = mid;
    else hi = mid;
  }

  return clip(okLabToRgb(okLchToOkLab({ L: lch.L, C: lo, H: lch.H })));
}

function clip(rgb: Rgb): Rgb {
  const c = (v: number): number => Math.min(1, Math.max(0, v));
  return { r: c(rgb.r), g: c(rgb.g), b: c(rgb.b) };
}
