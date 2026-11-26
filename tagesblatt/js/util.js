/* Kleine Helfer: Datum, Escaping, IDs */

export const pad = (n) => String(n).padStart(2, "0");

/** Lokales Datum -> "YYYY-MM-DD" */
export function keyOf(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
/** "YYYY-MM-DD" -> lokales Date (Mitternacht) */
export function fromKey(k) {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(d, n) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  return x;
}
export const todayKey = () => keyOf(new Date());
export function isKey(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s || ""); }

/** Tage seit 1970 nach lokalem Kalender (stabil über Sommer-/Winterzeit) */
export function dayIndex(date) {
  const d = typeof date === "string" ? fromKey(date) : date;
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
}
export function daysBetween(aKey, bKey) { return dayIndex(bKey) - dayIndex(aKey); }

const WT = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
const WT_KURZ = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const MON = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
export const weekdayName = (d) => WT[d.getDay()];
export const weekdayShort = (i) => WT_KURZ[i];
export const monthName = (m) => MON[m];
export const WOCHENTAGE = WT;

export function fmtDate(d, withYear = false) {
  return `${d.getDate()}. ${MON[d.getMonth()]}${withYear ? " " + d.getFullYear() : ""}`;
}
export function fmtShort(d) { return `${WT_KURZ[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}.`; }
export function fmtTime(d) { return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
export function relDay(k) {
  const n = daysBetween(todayKey(), k);
  if (n === 0) return "heute";
  if (n === 1) return "morgen";
  if (n === -1) return "gestern";
  if (n > 1 && n < 7) return `in ${n} Tagen`;
  if (n < -1 && n > -30) return `vor ${-n} Tagen`;
  return fmtShort(fromKey(k));
}

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
/** Nur http(s)-Links durchlassen */
export function safeUrl(u) {
  try { const x = new URL(u, location.href); return /^https?:$/.test(x.protocol) ? x.href : ""; } catch { return ""; }
}
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/** Für Namensabgleich: klein, ohne Akzente/Satzzeichen */
export function norm(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\((ungekurzt|gekurzt|unabridged|abridged)\)/g, "")
    .replace(/[^a-z0-9ß ]+/g, " ").replace(/\s+/g, " ").trim();
}
export function similarity(a, b) {
  const A = new Set(norm(a).split(" ").filter((w) => w.length > 1));
  const B = new Set(norm(b).split(" ").filter((w) => w.length > 1));
  if (!A.size || !B.size) return 0;
  let hit = 0; for (const w of A) if (B.has(w)) hit++;
  return hit / Math.max(A.size, B.size);
}
