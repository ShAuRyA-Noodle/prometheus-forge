/**
 * colorMath — small dependency-free color utility set.
 *
 * Used by BrandRefiner.PalettePreview, LandingEditor.ColorThemeOverride, and
 * composeLandingHtml when generating CSS variables. All inputs are lenient
 * (#FFF, #FFFFFF, FFFFFF, rgb(...) ); all outputs are normalized.
 *
 * Reference: WCAG 2.1 §1.4.3 contrast formula.
 */

export type RGB = { r: number; g: number; b: number };

const HEX3 = /^#?([0-9a-f]{3})$/i;
const HEX6 = /^#?([0-9a-f]{6})$/i;
const RGB_FN = /^rgba?\(\s*([0-9]{1,3})\s*,\s*([0-9]{1,3})\s*,\s*([0-9]{1,3})/i;

export function normalizeHex(hex: string): string {
  if (!hex) return "#000000";
  const trimmed = hex.trim();
  const m6 = HEX6.exec(trimmed);
  if (m6) return `#${m6[1]!.toLowerCase()}`;
  const m3 = HEX3.exec(trimmed);
  if (m3) {
    const [r, g, b] = m3[1]!.toLowerCase().split("");
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  const rgb = RGB_FN.exec(trimmed);
  if (rgb) {
    return rgbToHex({
      r: clampByte(parseInt(rgb[1]!, 10)),
      g: clampByte(parseInt(rgb[2]!, 10)),
      b: clampByte(parseInt(rgb[3]!, 10)),
    });
  }
  return "#000000";
}

export function isValidHex(hex: string): boolean {
  if (!hex) return false;
  return HEX6.test(hex.trim()) || HEX3.test(hex.trim());
}

export function hexToRgb(hex: string): RGB {
  const norm = normalizeHex(hex).slice(1);
  return {
    r: parseInt(norm.slice(0, 2), 16),
    g: parseInt(norm.slice(2, 4), 16),
    b: parseInt(norm.slice(4, 6), 16),
  };
}

export function rgbToHex({ r, g, b }: RGB): string {
  const toHex = (n: number) => clampByte(Math.round(n)).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function clampByte(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(255, n));
}

/** Relative luminance per WCAG 2.1. Output 0..1. */
export function relativeLuminance(rgb: RGB): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

/** Contrast ratio between two hex colors. Returns 1..21. */
export function contrastRatio(fg: string, bg: string): number {
  const Lf = relativeLuminance(hexToRgb(fg));
  const Lb = relativeLuminance(hexToRgb(bg));
  const [light, dark] = Lf > Lb ? [Lf, Lb] : [Lb, Lf];
  return (light + 0.05) / (dark + 0.05);
}

/** Pick the foreground color (white or black) with highest contrast on the given bg. */
export function pickReadableForeground(bg: string): "#FFFFFF" | "#000000" {
  return contrastRatio("#FFFFFF", bg) >= contrastRatio("#000000", bg) ? "#FFFFFF" : "#000000";
}

/** Determine WCAG AA pass for normal text (≥4.5) or large text (≥3). */
export function wcagAA(fg: string, bg: string, large: boolean = false): boolean {
  return contrastRatio(fg, bg) >= (large ? 3 : 4.5);
}

export function wcagAAA(fg: string, bg: string, large: boolean = false): boolean {
  return contrastRatio(fg, bg) >= (large ? 4.5 : 7);
}

/** Lighten by mixing toward white. amount 0..1. */
export function lighten(hex: string, amount: number): string {
  const a = Math.max(0, Math.min(1, amount));
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex({
    r: r + (255 - r) * a,
    g: g + (255 - g) * a,
    b: b + (255 - b) * a,
  });
}

/** Darken by mixing toward black. amount 0..1. */
export function darken(hex: string, amount: number): string {
  const a = Math.max(0, Math.min(1, amount));
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex({ r: r * (1 - a), g: g * (1 - a), b: b * (1 - a) });
}

/** Mix two hex colors. weight=0 returns a; weight=1 returns b. */
export function mix(a: string, b: string, weight: number): string {
  const w = Math.max(0, Math.min(1, weight));
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return rgbToHex({
    r: ca.r * (1 - w) + cb.r * w,
    g: ca.g * (1 - w) + cb.g * w,
    b: ca.b * (1 - w) + cb.b * w,
  });
}

/** RGB → HSL. */
export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const { r, g, b } = hexToRgb(hex);
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn:
        h = (gn - bn) / d + (gn < bn ? 6 : 0);
        break;
      case gn:
        h = (bn - rn) / d + 2;
        break;
      case bn:
        h = (rn - gn) / d + 4;
        break;
    }
    h *= 60;
  }
  return { h, s: s * 100, l: l * 100 };
}

export function hslToHex(h: number, s: number, l: number): string {
  const sn = Math.max(0, Math.min(100, s)) / 100;
  const ln = Math.max(0, Math.min(100, l)) / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const hh = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  let rp = 0;
  let gp = 0;
  let bp = 0;
  if (hh < 1) [rp, gp, bp] = [c, x, 0];
  else if (hh < 2) [rp, gp, bp] = [x, c, 0];
  else if (hh < 3) [rp, gp, bp] = [0, c, x];
  else if (hh < 4) [rp, gp, bp] = [0, x, c];
  else if (hh < 5) [rp, gp, bp] = [x, 0, c];
  else [rp, gp, bp] = [c, 0, x];
  const m = ln - c / 2;
  return rgbToHex({ r: (rp + m) * 255, g: (gp + m) * 255, b: (bp + m) * 255 });
}

/** Build derived shades for a base color (50-900 ramp). */
export function buildRamp(baseHex: string): Record<string, string> {
  const stops = [
    [50, 0.92],
    [100, 0.82],
    [200, 0.62],
    [300, 0.42],
    [400, 0.22],
    [500, 0],
    [600, -0.18],
    [700, -0.36],
    [800, -0.55],
    [900, -0.74],
  ] as const;
  const ramp: Record<string, string> = {};
  for (const [stop, amt] of stops) {
    if (amt === 0) ramp[stop] = normalizeHex(baseHex);
    else if (amt > 0) ramp[stop] = lighten(baseHex, amt);
    else ramp[stop] = darken(baseHex, -amt);
  }
  return ramp;
}
