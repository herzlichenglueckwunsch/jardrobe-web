/* =====================================================================
   DATEN-LOGIK: Kalender-Termine, Events, Tagesplan, Projekt-Vorschläge
   ===================================================================== */
import { CONFIG } from "./config.js";
import { store } from "./store.js";
import * as U from "./util.js";
import { parseICS, expand, fetchICS } from "./ics.js";

const D = () => store.data;
const FEED_TTL = 3 * 3600 * 1000;

/* ---------- ICS-Feeds laden & cachen ---------- */
const ser = (e) => ({ ...e, start: e.start.toISOString(), end: e.end ? e.end.toISOString() : null, exdates: [...e.exdates], description: (e.description || "").slice(0, 400) });
const rev = (e) => ({ ...e, start: new Date(e.start), end: e.end ? new Date(e.end) : null, exdates: new Set(e.exdates || []) });

let feedVersion = 0;
export async function loadFeeds(force = false) {
  const c = (store.cache.ics ||= {});
  const errors = [];
  await Promise.all(D().feeds.map(async (f) => {
    const hit = c[f.id];
    if (!force && hit && hit.url === f.url && Date.now() - hit.fetched < FEED_TTL) return;
    try {
      const txt = await fetchICS(f.url, D().prefs.proxyUrl);
      c[f.id] = { url: f.url, fetched: Date.now(), events: parseICS(txt).map(ser), error: null };
    } catch (e) {
      errors.push(`${f.name}: ${e.message}`);
      c[f.id] = { ...(hit || { events: [] }), url: f.url, fetched: Date.now() - FEED_TTL + 10 * 60 * 1000, error: e.message };
    }
  }));
  for (const id of Object.keys(c)) if (!D().feeds.some((f) => f.id === id)) delete c[id];
  store.saveCache();
  feedVersion++;
  memo.clear();
  return errors;
}
export const feedStatus = (id) => (store.cache.ics || {})[id] || null;

const memo = new Map();
/** Feed-Termine im Fenster [from, to] für "kalender" oder "events" */
export function feedOccurrences(kind, from, to) {
  const mk = `${kind}|${U.keyOf(from)}|${U.keyOf(to)}|${feedVersion}|${D().feeds.length}`;
  if (memo.has(mk)) return memo.get(mk);
  const out = [];
  for (const f of D().feeds.filter((x) => x.kind === kind)) {
    const st = feedStatus(f.id);
    if (!st || !st.events) continue;
    for (const o of expand(st.events.map(rev), from, to)) {
      out.push({ ...o, id: `${f.id}|${o.uid}|${+o.start}`, feedId: f.id, quelle: f.name, kategorie: f.kategorie || "" });
    }
  }
  out.sort((a, b) => a.start - b.start);
  memo.set(mk, out);
  return out;
}
export function invalidate() { feedVersion++; memo.clear(); }

const dayStart = (k) => U.fromKey(k);
const dayEnd = (k) => new Date(+U.addDays(U.fromKey(k), 1) - 1);

/* ---------- Partyreihen & Events ---------- */
function nth(d) { return Math.floor((d.getDate() - 1) / 7) + 1; }
function isLast(d) { return U.addDays(d, 7).getMonth() !== d.getMonth(); }

export function seriesOn(s, d) {
  if (s.rhythmus === "einmalig") return s.datum === U.keyOf(d);
  if (d.getDay() !== +s.wochentag) return false;
  if (s.rhythmus === "woechentlich") return true;
  if (s.rhythmus === "monatlich") return +s.nter === -1 ? isLast(d) : nth(d) === +s.nter;
  return false;
}
export function seriesLabel(s) {
  const wt = U.WOCHENTAGE[+s.wochentag];
  if (s.rhythmus === "einmalig") return s.datum ? U.fmtShort(U.fromKey(s.datum)) : "einmalig";
  if (s.rhythmus === "woechentlich") return `jeden ${wt}`;
  const n = { 1: "1.", 2: "2.", 3: "3.", 4: "4.", "-1": "letzten" }[s.nter] || s.nter + ".";
  return `jeden ${n} ${wt} im Monat`;
}

function withTime(d, hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || "");
  return m ? new Date(d.getFullYear(), d.getMonth(), d.getDate(), +m[1], +m[2]) : new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function allEvents(fromKey, toKey) {
  const from = dayStart(fromKey), to = dayEnd(toKey);
  const out = [];
  for (let d = from; d <= to; d = U.addDays(d, 1)) {
    for (const s of D().series) if (seriesOn(s, d)) {
      const start = withTime(d, s.zeit);
      out.push({ id: `r|${s.id}|${U.keyOf(d)}`, title: s.name, start, end: new Date(+start + 5 * 3600000), allDay: !s.zeit, location: s.ort || "", url: s.url || "", kategorie: s.kategorie, quelle: "Partyreihe", typ: "reihe" });
    }
  }
  for (const e of D().events) {
    if (e.date < fromKey || e.date > toKey) continue;
    const start = withTime(U.fromKey(e.date), e.time);
    out.push({ id: `e|${e.id}`, eid: e.id, title: e.title, start, end: new Date(+start + 3 * 3600000), allDay: !e.time, location: e.ort || "", url: e.url || "", kategorie: e.kategorie, quelle: "Eigenes Event", typ: "eigen" });
  }
  for (const o of feedOccurrences("events", from, to)) out.push({ ...o, typ: "feed" });
  return out.sort((a, b) => a.start - b.start);
}

export function matchesPrefs(ev) {
  const p = D().prefs;
  if (ev.typ === "eigen") return true;
  if (ev.typ === "reihe" && p.reihenImmer) return true;
  const cats = p.kategorien || [];
  const kws = (p.stichworte || []).map((w) => U.norm(w)).filter(Boolean);
  if (!cats.length && !kws.length) return true;
  if (ev.kategorie && cats.includes(ev.kategorie)) return true;
  const hay = U.norm(`${ev.title} ${ev.description || ""} ${ev.location || ""}`);
  return kws.some((w) => hay.includes(w));
}
export const recommended = (fromKey, toKey) => allEvents(fromKey, toKey).filter(matchesPrefs);
export const katLabel = (id) => (CONFIG.kategorien.find((k) => k.id === id) || {}).label || id || "";

/* ---------- Tagesplan ---------- */
export function calendarFor(k) {
  return feedOccurrences("kalender", dayStart(k), dayEnd(k));
}
export function tasksFor(k) {
  return D().tasks.filter((t) => t.date === k).sort((a, b) => (a.time || "99").localeCompare(b.time || "99"));
}
export function busyMinutes(k) {
  const s = dayStart(k), e = dayEnd(k);
  let m = 0;
  for (const o of calendarFor(k)) if (!o.allDay) m += (Math.min(+o.end, +e) - Math.max(+o.start, +s)) / 60000;
  for (const t of tasksFor(k)) if (t.time && !t.done) m += 30;
  return Math.max(0, Math.round(m));
}

/** "14:30 Zahnarzt" / "9 Uhr Call" / "Einkaufen" -> {time, text} */
export function parseQuick(s) {
  s = s.trim();
  let m = /^(\d{1,2})[:.](\d{2})\s*(?:uhr)?\s+(.+)$/i.exec(s);
  if (m && +m[1] < 24 && +m[2] < 60) return { time: `${U.pad(+m[1])}:${m[2]}`, text: m[3] };
  m = /^(\d{1,2})\s*uhr\s+(.+)$/i.exec(s);
  if (m && +m[1] < 24) return { time: `${U.pad(+m[1])}:00`, text: m[2] };
  return { time: "", text: s };
}

/* ---------- Projekt-Vorschläge ---------- */
function hash(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; }

export function suggestions(k, n = 2) {
  const busy = busyMinutes(k);
  const list = D().projects.filter((p) => !p.fertig).map((p) => {
    const reasons = [];
    let score = (+p.prio || 1) * 2;
    if (+p.prio === 3) reasons.push("hohe Priorität");
    // Wer heute schon abgehakt hat, wird mit dem Stand von davor bewertet –
    // so bleiben die Vorschläge den ganzen Tag stabil (nur mit ✓).
    const ref = p.lastWorked === k ? p.prevWorked : p.lastWorked;
    const since = ref ? U.daysBetween(ref, k) : 21;
    score += Math.min(Math.max(since, 0) / 3, 4);
    if (!ref) reasons.push("noch nie angefangen");
    else if (since >= 5) reasons.push(`seit ${since} Tagen liegen geblieben`);
    if (p.deadline) {
      const left = U.daysBetween(k, p.deadline);
      if (left < 0) { score += 5; reasons.push("Deadline überschritten"); }
      else if (left <= 3) { score += 4; reasons.push(left === 0 ? "Deadline heute" : `Deadline in ${left} Tagen`); }
      else if (left <= 7) { score += 2.5; reasons.push(`Deadline in ${left} Tagen`); }
      else if (left <= 14) score += 1;
    }
    if (busy > 300) {
      if (p.aufwand === "klein") { score += 1.5; reasons.push("voller Tag – passt zwischendurch"); }
      if (p.aufwand === "gross") score -= 1;
    } else if (busy < 120 && p.aufwand === "gross") { score += 1; reasons.push("freier Tag – Zeit für was Großes"); }
    score += hash(k + p.id) - 0.5; // tägliche Abwechslung bei Gleichstand
    return { p, score, reasons };
  });
  return list.sort((a, b) => b.score - a.score).slice(0, n);
}
