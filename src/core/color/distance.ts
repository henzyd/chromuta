import type { Color, OkLab } from './types.js';

/**
 * Perceptual distance in OKLab. Because OKLab is near-uniform this is a plain
 * Euclidean metric, which is why it is the canonical space: palette remapping
 * needs a nearest-match search on every literal in the workspace.
 *
 * Rough scale: 0.02 is a just-noticeable difference, 0.1 is clearly a different color.
 */
export function deltaEOk(a: OkLab, b: OkLab): number {
  const dL = a.L - b.L;
  const da = a.a - b.a;
  const db = a.b - b.b;
  return Math.sqrt(dL * dL + da * da + db * db);
}

/** Distance including alpha, so #000 and #0000 are not treated as identical. */
export function colorDistance(a: Color, b: Color): number {
  const d = deltaEOk(a.ok, b.ok);
  const dAlpha = a.alpha - b.alpha;
  return Math.sqrt(d * d + dAlpha * dAlpha);
}

/**
 * Stable identity key. Two literals collapse to one palette entry when their keys
 * match, so #FFF, #ffffff and rgb(255 255 255) count as a single color with three
 * occurrences. Rounded to 4 decimals to absorb float noise from round-tripping.
 */
export function colorKey(color: Color): string {
  const q = (n: number): string => (Math.round(n * 1e4) / 1e4).toFixed(4);
  return `${q(color.ok.L)},${q(color.ok.a)},${q(color.ok.b)},${q(color.alpha)}`;
}

export function colorsEqual(a: Color, b: Color): boolean {
  return colorKey(a) === colorKey(b);
}
