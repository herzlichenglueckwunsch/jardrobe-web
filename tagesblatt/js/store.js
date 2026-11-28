/* =====================================================================
   SPEICHER – alles bleibt lokal auf dem Gerät (localStorage).
   "data"  = deine Inhalte (Notizen, Projekte, …) -> im Backup enthalten
   "cache" = abgerufene Daten (Medien, Kalender) -> wird neu geladen
   ===================================================================== */
import { CONFIG } from "./config.js";
import { uid } from "./util.js";

const KEY = "tagesblatt_v1";
const CKEY = "tagesblatt_cache_v1";

function seed() {
  return {
    version: 1,
    notes: {},          // { "2026-11-26": "Text" }
    tasks: [],          // { id, date, time, text, done }
    projects: CONFIG.projekte.map((p) => ({ id: uid(), lastWorked: null, deadline: "", ...p })),
    follows: [],        // { id, type: "podcast"|"hoerbuch", term, collectionId, name, artwork }
    feeds: [],          // { id, name, url, kind: "kalender"|"events", kategorie }
    events: [],         // eigene Events: { id, date, time, title, ort, kategorie, url }
    series: CONFIG.reihen.map((r) => ({ id: uid(), ...r })),
    prefs: {
      skin: "ausjestellt",
      theme: "auto",
      land: CONFIG.land,
      proxyUrl: "",
      spotifyClientId: "",
      reihenImmer: true,
      ...structuredClone(CONFIG.prefs),
    },
    meta: { lastMediaVisit: 0, prevMediaVisit: 0 },
  };
}

function read(key, fallback) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback(); }
  catch { return fallback(); }
}
function write(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); return true; }
  catch (e) { console.warn("Speichern fehlgeschlagen", e); return false; }
}

function migrate(d) {
  const s = seed();
  for (const k of Object.keys(s)) if (d[k] === undefined) d[k] = s[k];
  d.prefs = { ...s.prefs, ...d.prefs };
  d.meta = { ...s.meta, ...d.meta };
  return d;
}

export const store = {
  data: migrate(read(KEY, seed)),
  cache: read(CKEY, () => ({})),
  onSave: null, // wird von sync.js gesetzt (Änderungen mitschreiben)
  save() { const ok = write(KEY, this.data); if (ok && this.onSave) this.onSave(); return ok; },
  saveCache() {
    if (!write(CKEY, this.cache)) { this.cache = {}; write(CKEY, this.cache); }
  },
  exportJSON() {
    return JSON.stringify({ app: "tagesblatt", exportiert: new Date().toISOString(), data: this.data }, null, 2);
  },
  importJSON(text) {
    const obj = JSON.parse(text);
    const d = obj && obj.app === "tagesblatt" ? obj.data : null;
    if (!d || typeof d !== "object") throw new Error("Keine Sicherung von juten Tach!");
    this.data = migrate(d);
    this.save();
  },
  reset() {
    localStorage.removeItem(KEY); localStorage.removeItem(CKEY);
    this.data = seed(); this.cache = {}; this.save();
  },
};
