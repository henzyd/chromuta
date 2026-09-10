import { clampToSrgbGamut, isInSrgbGamut } from './gamut.js';
import { nameForHex } from './named.js';
import { okLabToLab, okLabToOkLch, rgbToHsl, labToLch } from './spaces.js';
import type { Color, FormatOptions, OutputNotation } from './types.js';
import { DEFAULT_FORMAT_OPTIONS } from './types.js';

/**
 * Render a color in the requested notation.
 *
 * Returns null only for `named`, and only when no CSS keyword matches exactly.
 * Callers filter those out rather than falling back, so the picker never offers a
 * "named" option that would silently emit hex instead.
 */
export function formatColor(
  color: Color,
  notation: OutputNotation,
  options: Partial<FormatOptions> = {}
): string | null {
  const opts: FormatOptions = { ...DEFAULT_FORMAT_OPTIONS, ...options };

  switch (notation) {
    case 'hex':
      return formatHex(color, opts);
    case 'rgb':
      return formatRgb(color, opts);
    case 'hsl':
      return formatHsl(color, opts);
    case 'oklch':
      return formatOklch(color, opts);
    case 'oklab':
      return formatOklab(color, opts);
    case 'lab':
      return formatLab(color, opts);
    case 'lch':
      return formatLch(color, opts);
    case 'named':
      return formatNamed(color);
  }
}

/**
 * True when writing this color in this notation would lose information, i.e. the
 * color sits outside sRGB and the target notation cannot represent it. The
 * conversion command warns instead of silently mangling the value.
 */
export function isLossyConversion(color: Color, notation: OutputNotation): boolean {
  const boundToSrgb =
    notation === 'hex' || notation === 'rgb' || notation === 'hsl' || notation === 'named';
  return boundToSrgb && !isInSrgbGamut(color.ok);
}

// ---------------------------------------------------------------------------
// Per-notation renderers
// ---------------------------------------------------------------------------

function formatHex(color: Color, opts: FormatOptions): string {
  const rgb = clampToSrgbGamut(color.ok);
  const byte = (v: number): string =>
    Math.round(v * 255)
      .toString(16)
      .padStart(2, '0');

  let hex = byte(rgb.r) + byte(rgb.g) + byte(rgb.b);
  if (color.alpha < 1) hex += byte(color.alpha);

  if (opts.shorthandHex && canShorten(hex)) {
    hex = hex
      .split('')
      .filter((_, i) => i % 2 === 0)
      .join('');
  }

  return '#' + (opts.hexCase === 'upper' ? hex.toUpperCase() : hex);
}

function canShorten(hex: string): boolean {
  for (let i = 0; i < hex.length; i += 2) {
    if (hex[i] !== hex[i + 1]) return false;
  }
  return true;
}

function formatRgb(color: Color, opts: FormatOptions): string {
  const rgb = clampToSrgbGamut(color.ok);
  const ch = (v: number): string => String(Math.round(v * 255));
  const parts = [ch(rgb.r), ch(rgb.g), ch(rgb.b)];

  if (opts.functionSyntax === 'legacy') {
    const sep = opts.spaceAfterComma === false ? ',' : ', ';
    return color.alpha < 1
      ? `rgba(${parts.join(sep)}${sep}${alphaText(color.alpha, opts)})`
      : `rgb(${parts.join(sep)})`;
  }

  return color.alpha < 1
    ? `rgb(${parts.join(' ')} / ${alphaText(color.alpha, opts)})`
    : `rgb(${parts.join(' ')})`;
}

function formatHsl(color: Color, opts: FormatOptions): string {
  const hsl = rgbToHsl(clampToSrgbGamut(color.ok));
  const h = num(hsl.h, opts.precision);
  const s = `${num(hsl.s, opts.precision)}%`;
  const l = `${num(hsl.l, opts.precision)}%`;

  if (opts.functionSyntax === 'legacy') {
    const sep = opts.spaceAfterComma === false ? ',' : ', ';
    return color.alpha < 1
      ? `hsla(${[h, s, l].join(sep)}${sep}${alphaText(color.alpha, opts)})`
      : `hsl(${[h, s, l].join(sep)})`;
  }

  return color.alpha < 1
    ? `hsl(${h} ${s} ${l} / ${alphaText(color.alpha, opts)})`
    : `hsl(${h} ${s} ${l})`;
}

function formatOklch(color: Color, opts: FormatOptions): string {
  const lch = okLabToOkLch(color.ok);
  // OKLCh lightness and chroma are small numbers; two extra digits keep the
  // round-trip inside one 8-bit step.
  const p = opts.precision + 1;
  const body = `${num(lch.L, p)} ${num(lch.C, p)} ${num(lch.H, opts.precision)}`;
  return wrapModern('oklch', body, color.alpha, opts);
}

function formatOklab(color: Color, opts: FormatOptions): string {
  const p = opts.precision + 1;
  const body = `${num(color.ok.L, p)} ${num(color.ok.a, p)} ${num(color.ok.b, p)}`;
  return wrapModern('oklab', body, color.alpha, opts);
}

function formatLab(color: Color, opts: FormatOptions): string {
  const lab = okLabToLab(color.ok);
  const body = `${num(lab.L, opts.precision)} ${num(lab.a, opts.precision)} ${num(lab.b, opts.precision)}`;
  return wrapModern('lab', body, color.alpha, opts);
}

function formatLch(color: Color, opts: FormatOptions): string {
  const lch = labToLch(okLabToLab(color.ok));
  const body = `${num(lch.L, opts.precision)} ${num(lch.C, opts.precision)} ${num(lch.H, opts.precision)}`;
  return wrapModern('lch', body, color.alpha, opts);
}

function formatNamed(color: Color): string | null {
  if (color.alpha === 0) return 'transparent';
  if (color.alpha < 1) return null;
  if (!isInSrgbGamut(color.ok)) return null;

  const rgb = clampToSrgbGamut(color.ok);
  const byte = (v: number): string =>
    Math.round(v * 255)
      .toString(16)
      .padStart(2, '0');
  return nameForHex(byte(rgb.r) + byte(rgb.g) + byte(rgb.b)) ?? null;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** oklch/oklab/lab/lch have no legacy comma form, so they always use slash-alpha. */
function wrapModern(fn: string, body: string, alpha: number, opts: FormatOptions): string {
  return alpha < 1 ? `${fn}(${body} / ${alphaText(alpha, opts)})` : `${fn}(${body})`;
}

function alphaText(alpha: number, opts: FormatOptions): string {
  return opts.alphaStyle === 'percent'
    ? `${num(alpha * 100, Math.max(0, opts.precision - 1))}%`
    : num(alpha, Math.max(opts.precision, 2));
}

/** Round to `precision` places and drop trailing zeros, so 0.500 renders as 0.5. */
function num(value: number, precision: number): string {
  if (!Number.isFinite(value)) return '0';
  const fixed = value.toFixed(precision);
  return fixed.includes('.') ? fixed.replace(/\.?0+$/, '') : fixed;
}
