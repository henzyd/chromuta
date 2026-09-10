import type { Hsl, Lab, Lch, OkLab, OkLch, Rgb, Xyz } from './types.js';

/*
 * Conversion matrices and transfer functions follow CSS Color Module Level 4 and
 * Björn Ottosson's OKLab derivation. Coefficients are written at full precision so
 * round-trips stay stable at the 6-decimal level asserted in the tests.
 */

const cbrt = (x: number): number => Math.cbrt(x);

// ---------------------------------------------------------------------------
// sRGB transfer function
// ---------------------------------------------------------------------------

export function srgbToLinear(c: number): number {
  const abs = Math.abs(c);
  const sign = c < 0 ? -1 : 1;
  return abs <= 0.04045 ? c / 12.92 : sign * Math.pow((abs + 0.055) / 1.055, 2.4);
}

export function linearToSrgb(c: number): number {
  const abs = Math.abs(c);
  const sign = c < 0 ? -1 : 1;
  return abs <= 0.0031308 ? c * 12.92 : sign * (1.055 * Math.pow(abs, 1 / 2.4) - 0.055);
}

export function rgbToLinearRgb(rgb: Rgb): Rgb {
  return { r: srgbToLinear(rgb.r), g: srgbToLinear(rgb.g), b: srgbToLinear(rgb.b) };
}

export function linearRgbToRgb(lin: Rgb): Rgb {
  return { r: linearToSrgb(lin.r), g: linearToSrgb(lin.g), b: linearToSrgb(lin.b) };
}

// ---------------------------------------------------------------------------
// linear sRGB <-> OKLab
// ---------------------------------------------------------------------------

export function linearRgbToOkLab(lin: Rgb): OkLab {
  const l = 0.4122214708 * lin.r + 0.5363325363 * lin.g + 0.0514459929 * lin.b;
  const m = 0.2119034982 * lin.r + 0.6806995451 * lin.g + 0.1073969566 * lin.b;
  const s = 0.0883024619 * lin.r + 0.2817188376 * lin.g + 0.6299787005 * lin.b;

  const l_ = cbrt(l);
  const m_ = cbrt(m);
  const s_ = cbrt(s);

  return {
    L: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_
  };
}

export function okLabToLinearRgb(ok: OkLab): Rgb {
  const l_ = ok.L + 0.3963377774 * ok.a + 0.2158037573 * ok.b;
  const m_ = ok.L - 0.1055613458 * ok.a - 0.0638541728 * ok.b;
  const s_ = ok.L - 0.0894841775 * ok.a - 1.291485548 * ok.b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  return {
    r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  };
}

export const rgbToOkLab = (rgb: Rgb): OkLab => linearRgbToOkLab(rgbToLinearRgb(rgb));
export const okLabToRgb = (ok: OkLab): Rgb => linearRgbToRgb(okLabToLinearRgb(ok));

// ---------------------------------------------------------------------------
// Polar forms
// ---------------------------------------------------------------------------

/** Below this chroma the hue angle is numerically meaningless, so it is pinned to 0. */
const ACHROMATIC_EPSILON = 1e-6;

export function okLabToOkLch(ok: OkLab): OkLch {
  const C = Math.sqrt(ok.a * ok.a + ok.b * ok.b);
  if (C < ACHROMATIC_EPSILON) return { L: ok.L, C: 0, H: 0 };
  const H = (Math.atan2(ok.b, ok.a) * 180) / Math.PI;
  return { L: ok.L, C, H: H < 0 ? H + 360 : H };
}

export function okLchToOkLab(lch: OkLch): OkLab {
  const rad = (lch.H * Math.PI) / 180;
  return { L: lch.L, a: lch.C * Math.cos(rad), b: lch.C * Math.sin(rad) };
}

export function labToLch(lab: Lab): Lch {
  const C = Math.sqrt(lab.a * lab.a + lab.b * lab.b);
  if (C < ACHROMATIC_EPSILON) return { L: lab.L, C: 0, H: 0 };
  const H = (Math.atan2(lab.b, lab.a) * 180) / Math.PI;
  return { L: lab.L, C, H: H < 0 ? H + 360 : H };
}

export function lchToLab(lch: Lch): Lab {
  const rad = (lch.H * Math.PI) / 180;
  return { L: lch.L, a: lch.C * Math.cos(rad), b: lch.C * Math.sin(rad) };
}

// ---------------------------------------------------------------------------
// XYZ, chromatic adaptation, CIE Lab
// ---------------------------------------------------------------------------

export function linearRgbToXyzD65(lin: Rgb): Xyz {
  return {
    x: 0.4123907992659595 * lin.r + 0.35758433938387796 * lin.g + 0.1804807884018343 * lin.b,
    y: 0.21263900587151036 * lin.r + 0.7151686787677559 * lin.g + 0.07219231536073371 * lin.b,
    z: 0.01933081871559185 * lin.r + 0.11919477979462599 * lin.g + 0.9505321522496606 * lin.b
  };
}

export function xyzD65ToLinearRgb(xyz: Xyz): Rgb {
  return {
    r: 3.2409699419045213 * xyz.x - 1.5373831775700935 * xyz.y - 0.4986107602930033 * xyz.z,
    g: -0.9692436362808798 * xyz.x + 1.8759675015077207 * xyz.y + 0.04155505740717561 * xyz.z,
    b: 0.05563007969699361 * xyz.x - 0.20397695888897653 * xyz.y + 1.0569715142428786 * xyz.z
  };
}

/** Bradford adaptation. CSS `lab()` and `lch()` are defined against D50. */
export function xyzD65ToD50(xyz: Xyz): Xyz {
  return {
    x: 1.0479298208405488 * xyz.x + 0.022946793341019088 * xyz.y - 0.05019222954313557 * xyz.z,
    y: 0.029627815688159344 * xyz.x + 0.990434484573249 * xyz.y - 0.01707382502938514 * xyz.z,
    z: -0.009243058152591178 * xyz.x + 0.015055144896577895 * xyz.y + 0.7518742899580008 * xyz.z
  };
}

export function xyzD50ToD65(xyz: Xyz): Xyz {
  return {
    x: 0.9554734527042182 * xyz.x - 0.023098536874261423 * xyz.y + 0.0632593086610217 * xyz.z,
    y: -0.028369706963208136 * xyz.x + 1.0099954580058226 * xyz.y + 0.021041398966943008 * xyz.z,
    z: 0.012314001688319899 * xyz.x - 0.020507696433477912 * xyz.y + 1.3303659366080753 * xyz.z
  };
}

const D50_WHITE: Xyz = { x: 0.3457 / 0.3585, y: 1, z: (1 - 0.3457 - 0.3585) / 0.3585 };

const LAB_EPSILON = 216 / 24389;
const LAB_KAPPA = 24389 / 27;

export function xyzD50ToLab(xyz: Xyz): Lab {
  const f = (t: number): number => (t > LAB_EPSILON ? cbrt(t) : (LAB_KAPPA * t + 16) / 116);
  const fx = f(xyz.x / D50_WHITE.x);
  const fy = f(xyz.y / D50_WHITE.y);
  const fz = f(xyz.z / D50_WHITE.z);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

export function labToXyzD50(lab: Lab): Xyz {
  const fy = (lab.L + 16) / 116;
  const fx = lab.a / 500 + fy;
  const fz = fy - lab.b / 200;

  const fx3 = fx * fx * fx;
  const fz3 = fz * fz * fz;

  const x = fx3 > LAB_EPSILON ? fx3 : (116 * fx - 16) / LAB_KAPPA;
  const y = lab.L > LAB_KAPPA * LAB_EPSILON ? fy * fy * fy : lab.L / LAB_KAPPA;
  const z = fz3 > LAB_EPSILON ? fz3 : (116 * fz - 16) / LAB_KAPPA;

  return { x: x * D50_WHITE.x, y: y * D50_WHITE.y, z: z * D50_WHITE.z };
}

export const okLabToLab = (ok: OkLab): Lab =>
  xyzD50ToLab(xyzD65ToD50(linearRgbToXyzD65(okLabToLinearRgb(ok))));

export const labToOkLab = (lab: Lab): OkLab =>
  linearRgbToOkLab(xyzD65ToLinearRgb(xyzD50ToD65(labToXyzD50(lab))));

// ---------------------------------------------------------------------------
// display-p3, for color() input
// ---------------------------------------------------------------------------

export function linearP3ToXyzD65(lin: Rgb): Xyz {
  return {
    x: 0.4865709486482162 * lin.r + 0.26566769316909306 * lin.g + 0.1982172852343625 * lin.b,
    y: 0.2289745640697488 * lin.r + 0.6917385218365064 * lin.g + 0.079286914093745 * lin.b,
    z: 0.0 * lin.r + 0.04511338185890264 * lin.g + 1.043944368900976 * lin.b
  };
}

// ---------------------------------------------------------------------------
// HSL
// ---------------------------------------------------------------------------

export function rgbToHsl(rgb: Rgb): Hsl {
  const max = Math.max(rgb.r, rgb.g, rgb.b);
  const min = Math.min(rgb.r, rgb.g, rgb.b);
  const l = (max + min) / 2;
  const d = max - min;

  if (d < 1e-9) return { h: 0, s: 0, l: l * 100 };

  const s = d / (1 - Math.abs(2 * l - 1));

  let h: number;
  if (max === rgb.r) h = ((rgb.g - rgb.b) / d) % 6;
  else if (max === rgb.g) h = (rgb.b - rgb.r) / d + 2;
  else h = (rgb.r - rgb.g) / d + 4;

  h *= 60;
  if (h < 0) h += 360;

  return { h, s: s * 100, l: l * 100 };
}

export function hslToRgb(hsl: Hsl): Rgb {
  const h = ((hsl.h % 360) + 360) % 360;
  const s = hsl.s / 100;
  const l = hsl.l / 100;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  let rgb: Rgb;
  if (h < 60) rgb = { r: c, g: x, b: 0 };
  else if (h < 120) rgb = { r: x, g: c, b: 0 };
  else if (h < 180) rgb = { r: 0, g: c, b: x };
  else if (h < 240) rgb = { r: 0, g: x, b: c };
  else if (h < 300) rgb = { r: x, g: 0, b: c };
  else rgb = { r: c, g: 0, b: x };

  return { r: rgb.r + m, g: rgb.g + m, b: rgb.b + m };
}

// ---------------------------------------------------------------------------
// HWB, input only
// ---------------------------------------------------------------------------

export function hwbToRgb(h: number, w: number, b: number): Rgb {
  const white = w / 100;
  const black = b / 100;
  if (white + black >= 1) {
    const gray = white / (white + black);
    return { r: gray, g: gray, b: gray };
  }
  const base = hslToRgb({ h, s: 100, l: 50 });
  const scale = (c: number): number => c * (1 - white - black) + white;
  return { r: scale(base.r), g: scale(base.g), b: scale(base.b) };
}
