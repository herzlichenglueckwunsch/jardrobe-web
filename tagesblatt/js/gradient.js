/* =====================================================================
   FARBVERLAUF DES TAGES
   Jeder Kalendertag bekommt einen festen, eigenen Verlauf (gleiches Datum =
   gleicher Verlauf, auf jedem Gerät). Benachbarte Tage liegen über den
   "goldenen Winkel" weit auseinander, damit es nie zweimal ähnlich aussieht.
   ===================================================================== */
import { dayIndex } from "./util.js";

/* ---- Farbmathematik: OKLCH -> sRGB-Hex (mit Gamut-Mapping) ---- */
function oklchToLinear(L, C, h) {
  const hr = (h * Math.PI) / 180;
  const a = C * Math.cos(hr), b = C * Math.sin(hr);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}
const inGamut = (rgb) => rgb.every((v) => v >= -0.0001 && v <= 1.0001);
const gamma = (v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);

export function oklch(L, C, h) {
  let c = C, rgb = oklchToLinear(L, c, h);
  while (!inGamut(rgb) && c > 0) { c -= 0.005; rgb = oklchToLinear(L, Math.max(c, 0), h); }
  const lin = rgb.map((v) => Math.min(1, Math.max(0, v)));
  return "#" + lin.map((v) => Math.round(gamma(v) * 255).toString(16).padStart(2, "0")).join("");
}

/* ---- WCAG-Kontrast ---- */
function relLum(hex) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
export function contrast(a, b) {
  const [x, y] = [relLum(a), relLum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/* ---- Zufall mit festem Startwert ---- */
function mulberry(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MODI = [
  { id: "analog",       offs: [0, 32, 64] },
  { id: "komplementär", offs: [0, 28, 180] },
  { id: "triadisch",    offs: [0, 120, 240] },
  { id: "geteilt",      offs: [0, 150, 210] },
  { id: "sanft",        offs: [0, -24, 22] },
];
const WOERTER = [
  [0, "Kirsch"], [22, "Kupfer"], [45, "Honig"], [70, "Limette"], [100, "Wiese"],
  [150, "Minze"], [185, "Lagune"], [215, "Kornblume"], [250, "Flieder"],
  [285, "Orchidee"], [320, "Himbeer"], [345, "Kirsch"],
];
function wort(h) {
  h = ((h % 360) + 360) % 360;
  let w = WOERTER[0][1];
  for (const [start, name] of WOERTER) if (h >= start) w = name;
  return w;
}

/** Liefert den Verlauf für ein Datum (Date oder "YYYY-MM-DD"). */
export function gradientFor(date) {
  const idx = dayIndex(date);
  const r = mulberry(idx * 2654435761);
  const base = (idx * 137.508 + r() * 40) % 360;
  const modus = MODI[Math.floor(r() * MODI.length)];
  const winkel = Math.round(110 + r() * 70);
  const hues = modus.offs.map((o) => (base + o + 360) % 360);
  const Ls = [0.8 + r() * 0.05, 0.72 + r() * 0.05, 0.84 + r() * 0.05];
  const stops = hues.map((h, i) => oklch(Ls[i], 0.12 + r() * 0.05, h));

  // Akzent (Rahmen, Buttons): kräftig, aber mit >= 4.5:1 Kontrast
  let Lh = 0.56, akzentHell = oklch(Lh, 0.19, hues[0]);
  while (contrast(akzentHell, "#ffffff") < 4.5 && Lh > 0.2) { Lh -= 0.02; akzentHell = oklch(Lh, 0.19, hues[0]); }
  let Ld = 0.72, akzentDunkel = oklch(Ld, 0.15, hues[0]);
  while (contrast(akzentDunkel, "#0e0e0e") < 4.5 && Ld < 0.95) { Ld += 0.02; akzentDunkel = oklch(Ld, 0.15, hues[0]); }

  return {
    nummer: idx,
    name: `${wort(hues[0])} trifft ${wort(hues[2])}`,
    modus: modus.id,
    stops,
    css: `linear-gradient(${winkel}deg, ${stops[0]} 0%, ${stops[1]} 52%, ${stops[2]} 100%)`,
    akzentHell,
    akzentDunkel,
    tint: oklch(0.97, 0.02, hues[0]),
    tintDunkel: oklch(0.2, 0.025, hues[0]),
  };
}
