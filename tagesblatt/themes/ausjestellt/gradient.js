/* =====================================================================
   THEME "ausjestellt" – FARBVERLAUF DES TAGES
   Im Geist von ausjestellt.de: senkrechte Verläufe aus kräftigen
   Druckfarben, fast immer mit schwarzem Band, unten in Anthrazit.
   Jeder Tag: eigener Verlauf (gleiches Datum = gleicher Verlauf).
   Die Verläufe von ausjestellt.de selbst kommen bewusst NICHT vor.

   Zum Anpassen: FARBEN (Name + Hex) und MUSTER (Aufbau) unten ändern.
   Vorschau aller Tage: vorschau.html
   ===================================================================== */
import { dayIndex } from "../../js/util.js";
import { contrast, mulberry } from "../../js/farbe.js";

export const FARBEN = [
  ["Signalrot", "#e30613"], ["Lila", "#82368c"], ["Gelb", "#dedc00"], ["Grün", "#3aaa35"],
  ["Magenta", "#e6007e"], ["Cyan", "#009fe3"], ["Orange", "#f39200"], ["Petrol", "#00a19a"],
  ["Ultramarin", "#312783"], ["Limette", "#95c11f"], ["Weinrot", "#a3195b"], ["Himmel", "#36a9e1"],
];
const GRAU = ["#3b3a3d", "#2b2a2d", "#4a484c"];
const SCHWARZ = "#000000";

/* Aufbau der Verläufe. r(a,b) = Zufallsposition zwischen a und b (%) */
const MUSTER = [
  { id: "sandwich", bau: (A, B, G, r) => [[A, 0], [SCHWARZ, r(34, 48)], [B, r(70, 84)], [G, 100]] },
  { id: "horizont", bau: (A, B, G, r) => [[SCHWARZ, 0], [SCHWARZ, r(12, 22)], [A, r(46, 60)], [B, 100]] },
  { id: "doppel",   bau: (A, B, G, r) => [[A, 0], [SCHWARZ, r(26, 34)], [B, r(50, 58)], [SCHWARZ, r(76, 84)], [G, 100]] },
  { id: "glut",     bau: (A, B, G, r) => [[A, 0], [B, r(28, 40)], [SCHWARZ, r(62, 72)], [G, 100]] },
  { id: "spiegel",  bau: (A, B, G, r) => [[G, 0], [A, r(18, 28)], [SCHWARZ, 50], [B, r(72, 82)], [G, 100]] },
];

/* Hex mischen: t=0 -> a, t=1 -> b */
function mix(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (p, s) => (p >> s) & 255;
  return "#" + [16, 8, 0].map((s) => Math.round(ch(pa, s) + (ch(pb, s) - ch(pa, s)) * t).toString(16).padStart(2, "0")).join("");
}
/* so lange zu Weiß/Schwarz mischen, bis der Kontrast reicht */
function lesbar(farbe, grund, ziel, richtung) {
  let f = farbe;
  for (let t = 0.05; contrast(f, grund) < ziel && t <= 1; t += 0.05) f = mix(farbe, richtung, t);
  return f;
}

export function gradient(date) {
  const idx = dayIndex(date);
  const r0 = mulberry(idx * 40503 + 7);
  const r = (a, b) => Math.round((a + r0() * (b - a)) * 10) / 10; // eine Nachkommastelle
  // A läuft über 5er-Schritte durch alle 12 Farben -> Nachbartage nie gleich
  const ai = (((idx * 5) % FARBEN.length) + FARBEN.length) % FARBEN.length;
  let bi = Math.floor(r0() * FARBEN.length);
  if (bi === ai) bi = (bi + 1 + Math.floor(r0() * (FARBEN.length - 1))) % FARBEN.length;
  const [nameA, A] = FARBEN[ai], [nameB, B] = FARBEN[bi];
  const G = GRAU[Math.floor(r0() * GRAU.length)];
  const muster = MUSTER[Math.floor(r0() * MUSTER.length)];
  const winkel = r0() < 0.7 ? 180 : [165, 195][Math.floor(r0() * 2)];
  const stops = muster.bau(A, B, G, r);
  const liste = stops.map(([c, p]) => `${c} ${p}%`).join(", ");

  // Akzent für Text auf Schwarz: die hellere der beiden Farben, notfalls aufgehellt
  const hell = contrast(A, SCHWARZ) >= contrast(B, SCHWARZ) ? A : B;
  const akzent = lesbar(hell, SCHWARZ, 4.5, "#ffffff");
  return {
    nummer: idx,
    name: `${nameA} über ${nameB}`,
    modus: muster.id,
    farben: [A, B],
    stops: stops.map(([c]) => c),
    css: `linear-gradient(${winkel}deg, ${liste})`,
    rahmen: `linear-gradient(90deg, ${liste})`,
    akzentHell: akzent,
    akzentDunkel: akzent,
    tint: mix(A, SCHWARZ, 0.82),
    tintDunkel: mix(A, SCHWARZ, 0.82),
    leisteA: lesbar(A, "#f6f6f6", 3, SCHWARZ),   // große Schrift auf weißer Leiste
    leisteB: lesbar(B, "#f6f6f6", 3, SCHWARZ),
  };
}
