/* =====================================================================
   THEME "jardrobe" – FARBVERLAUF DES TAGES
   Jeder Kalendertag bekommt einen festen, eigenen Verlauf (gleiches Datum =
   gleicher Verlauf, auf jedem Gerät). Benachbarte Tage liegen über den
   "goldenen Winkel" weit auseinander, damit es nie zweimal ähnlich aussieht.
   ===================================================================== */
import { dayIndex } from "../../js/util.js";
import { oklch, contrast, mulberry } from "../../js/farbe.js";

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
export function gradient(date) {
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
