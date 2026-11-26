import { shuffled } from './utils.js';

// 12 curated, colorblind-conscious, high-contrast-on-white colors (Okabe-Ito / Tol inspired).
// Ordered so any small prefix (2, 3, 4, 5, 6 colors) has maximal perceptual separation.
export const CURATED_PALETTE = Object.freeze([
  '#0072B2', // vivid blue
  '#D55E00', // vermilion orange
  '#009E73', // emerald teal
  '#CC3377', // magenta rose
  '#7B3294', // deep violet
  '#B87A00', // rich ochre
  '#C82829', // crimson red
  '#0088AA', // cerulean
  '#4B8B3B', // forest green
  '#8C4A27', // warm chestnut
  '#3F51B5', // indigo
  '#2F3E4E', // dark slate
]);

function linearToSrgbByte(c) {
  const clamped = Math.max(0, Math.min(1, c));
  const v = clamped <= 0.0031308
    ? 12.92 * clamped
    : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
  return Math.round(v * 255);
}

// Converts OKLCH (L in [0,1], C >= 0, H in degrees) to sRGB #RRGGBB.
export function oklchToHex(L, C, H) {
  const rad = (H * Math.PI) / 180;
  const a = C * Math.cos(rad);
  const b = C * Math.sin(rad);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  const rLin = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const gLin = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bLin = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;

  const hex = (n) => n.toString(16).padStart(2, '0').toUpperCase();
  return `#${hex(linearToSrgbByte(rLin))}${hex(linearToSrgbByte(gLin))}${hex(linearToSrgbByte(bLin))}`;
}

// Computes relative luminance (WCAG 2.1) for a #RRGGBB hex string.
export function relativeLuminance(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const toLin = (v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b);
}

// Contrast ratio against pure white (#FFFFFF).
export function contrastOnWhite(hex) {
  return 1.05 / (relativeLuminance(hex) + 0.05);
}

// Returns `count` perceptually distinct, high-contrast-on-white hex colors.
// For <= 12 items, draws from CURATED_PALETTE; for > 12 items, extends cleanly
// via golden-angle OKLCH stepping so high-ball patterns (e.g. z x y) stay distinct.
export function pickDistinctColors(count, { randomize = true } = {}) {
  if (count <= 0) {
    return [];
  }

  const base = [];
  if (count <= CURATED_PALETTE.length) {
    // Draw from the top window of maximally distinct curated hues.
    const poolSize = randomize
      ? Math.min(CURATED_PALETTE.length, Math.max(count, 8))
      : count;
    const pool = CURATED_PALETTE.slice(0, poolSize);
    const chosen = randomize ? shuffled(pool) : pool;
    return chosen.slice(0, count);
  }

  base.push(...CURATED_PALETTE);
  const extra = count - base.length;
  const GOLDEN_ANGLE = 137.50776405;
  const startHue = 22;
  for (let i = 0; i < extra; i++) {
    const hue = (startHue + i * GOLDEN_ANGLE) % 360;
    // Alternate lightness gently while keeping WCAG contrast >= 3.2:1 on white.
    const L = i % 2 === 0 ? 0.50 : 0.57;
    const C = 0.135;
    base.push(oklchToHex(L, C, hue));
  }
  return randomize ? shuffled(base) : base;
}

// Pre-built 36-color palette (12 curated + 24 golden-angle OKLCH) for compatibility.
export const PALETTE = Object.freeze(pickDistinctColors(36, { randomize: false }));
