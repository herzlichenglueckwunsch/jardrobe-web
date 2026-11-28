/* =====================================================================
   SYNC ZWISCHEN GERÄTEN – über deinen eigenen Webspace (sync.php)

   - Jedes Gerät wird einmal mit einem geheimen Sync-Code verbunden.
   - Aus dem Code werden abgeleitet: die Datei-ID auf dem Server und der
     Schlüssel. Verschlüsselt wird IM BROWSER (AES-GCM) – auf dem Server
     liegt nur unlesbarer Datensalat.
   - Zusammenführen pro Eintrag (eine Notiz, ein Projekt, eine Einstellung …):
     die jüngere Änderung gewinnt. Gelöschtes wird als "Grabstein" gemerkt,
     damit es nicht vom anderen Gerät zurückkommt.
   - NICHT synchronisiert: abgerufene Daten (Folgen, Charts, Kalender-Cache),
     Spotify-Anmeldung, "zuletzt besucht"-Zeiten. Die sind pro Gerät.
   ===================================================================== */
import { store } from "./store.js";

const SKEY = "tagesblatt_sync_v1";
const LISTEN = ["tasks", "projects", "follows", "feeds", "events", "series"];
const GRAB_TAGE = 90;            // Grabsteine so lange aufheben
const PUSH_VERZOEGERUNG = 2000;  // nach einer Änderung kurz warten, dann senden

/* ---------- Zustand (nur auf diesem Gerät, NICHT im Backup) ---------- */
function lade() {
  try { return JSON.parse(localStorage.getItem(SKEY)) || null; } catch { return null; }
}
let st = lade();               // { code, url, rev, stamps, deleted, snapshot, last, fehler }
const merke = () => { try { localStorage.setItem(SKEY, JSON.stringify(st)); } catch { /* voll */ } };

const hoerer = new Set();
export const onChange = (fn) => hoerer.add(fn);
const melde = (art) => hoerer.forEach((fn) => fn(art));

export const aktiv = () => !!(st && st.code);
export const status = () => (st ? { code: st.code, url: st.url, last: st.last, fehler: st.fehler, laeuft } : null);
export const standardUrl = () => new URL("sync.php", location.href).href;

/* ---------- Sync-Code & Krypto ---------- */
const ALPHA = "abcdefghjkmnpqrstuvwxyz23456789"; // ohne 0/o/1/l/i – gut abtippbar
export function neuerCode() {
  const b = crypto.getRandomValues(new Uint8Array(24));
  const s = [...b].map((x) => ALPHA[x % ALPHA.length]).join("");
  return s.match(/.{4}/g).join("-");
}
export const normCode = (c) => String(c || "").toLowerCase().replace(/[^a-z0-9]/g, "");

async function sha(text) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}
const hex = (b) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
const b64 = (b) => btoa(String.fromCharCode(...b));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function ableiten(code) {
  const c = normCode(code);
  const id = hex(await sha("jutentach-id:" + c));
  const key = await crypto.subtle.importKey("raw", await sha("jutentach-key:" + c), "AES-GCM", false, ["encrypt", "decrypt"]);
  return { id, key };
}
async function verschluesseln(key, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(obj))));
  // in Stücken kodieren, sonst zu viele Argumente für String.fromCharCode
  let bin = ""; for (let i = 0; i < ct.length; i += 32768) bin += String.fromCharCode(...ct.subarray(i, i + 32768));
  return JSON.stringify({ v: 1, iv: b64(iv), ct: btoa(bin) });
}
async function entschluesseln(key, blob) {
  const { iv, ct } = JSON.parse(blob);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, key, unb64(ct));
  return JSON.parse(new TextDecoder().decode(pt));
}

/* ---------- Daten <-> flache Einträge ---------- */
export function flach(d) {
  const m = {};
  for (const [k, v] of Object.entries(d.notes || {})) m["notes:" + k] = JSON.stringify(v);
  for (const l of LISTEN) for (const x of d[l] || []) if (x && x.id) m[l + ":" + x.id] = JSON.stringify(x);
  for (const [k, v] of Object.entries(d.prefs || {})) m["prefs:" + k] = JSON.stringify(v);
  return m;
}
export function aufbauen(m, basis) {
  const d = { ...basis, notes: {}, prefs: { ...basis.prefs } };
  const listen = Object.fromEntries(LISTEN.map((l) => [l, []]));
  for (const [k, v] of Object.entries(m)) {
    const i = k.indexOf(":"), art = k.slice(0, i), schl = k.slice(i + 1), wert = JSON.parse(v);
    if (art === "notes") d.notes[schl] = wert;
    else if (art === "prefs") d.prefs[schl] = wert;
    else if (listen[art]) listen[art].push(wert);
  }
  for (const l of LISTEN) {
    const reihenfolge = new Map((basis[l] || []).map((x, i) => [x.id, i]));
    d[l] = listen[l].sort((a, b) => (reihenfolge.get(a.id) ?? 1e9) - (reihenfolge.get(b.id) ?? 1e9));
  }
  return d;
}

/** Pro Eintrag die jüngere Änderung nehmen (Löschen zählt als Änderung) */
export function zusammenfuehren(a, b) {
  const out = { items: {}, stamps: {}, deleted: {} };
  const keys = new Set([...Object.keys(a.items), ...Object.keys(a.deleted), ...Object.keys(b.items), ...Object.keys(b.deleted)]);
  const ereignis = (s, k) => {
    const del = s.deleted[k] || 0, t = s.stamps[k] || 0;
    if (del && del >= t) return { t: del, del: true };
    if (s.items[k] !== undefined) return { t, wert: s.items[k] };
    return null;
  };
  const grenze = Date.now() - GRAB_TAGE * 86400000;
  for (const k of keys) {
    const ea = ereignis(a, k), eb = ereignis(b, k);
    let w = !ea ? eb : !eb ? ea : ea.t !== eb.t ? (ea.t > eb.t ? ea : eb)
      : (ea.del ? ea : eb.del ? eb : (ea.wert >= eb.wert ? ea : eb)); // Gleichstand: fest entscheiden
    if (!w) continue;
    if (w.del) { if (w.t > grenze) out.deleted[k] = w.t; }
    else { out.items[k] = w.wert; out.stamps[k] = w.t; }
  }
  return out;
}

/* ---------- Änderungen mitschreiben (bei jedem Speichern) ---------- */
function mitschreiben() {
  if (!aktiv()) return false;
  const jetzt = flach(store.data), alt = st.snapshot || {}, t = Date.now();
  let geaendert = false;
  for (const [k, v] of Object.entries(jetzt)) if (alt[k] !== v) { st.stamps[k] = t; delete st.deleted[k]; geaendert = true; }
  for (const k of Object.keys(alt)) if (!(k in jetzt)) { st.deleted[k] = t; delete st.stamps[k]; geaendert = true; }
  st.snapshot = jetzt;
  if (geaendert) merke();
  return geaendert;
}

let timer = null;
store.onSave = () => {
  if (mitschreiben()) { clearTimeout(timer); timer = setTimeout(() => jetztSync().catch(() => {}), PUSH_VERZOEGERUNG); }
};

/** Zusammengeführten Stand lokal übernehmen, ohne ihn als neue Änderung zu zählen */
function uebernehmen(gemischt) {
  const neu = aufbauen(gemischt.items, store.data);
  const vorher = JSON.stringify(flach(store.data));
  st.stamps = gemischt.stamps; st.deleted = gemischt.deleted; st.snapshot = flach(neu);
  merke();
  store.data = neu;
  store.save();
  return JSON.stringify(st.snapshot) !== vorher;
}

/* ---------- Server ---------- */
async function holen(url, id) {
  const r = await fetch(`${url}?id=${id}`, { cache: "no-store" });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(await serverFehler(r));
  return r.json(); // { rev, blob }
}
async function senden(url, id, basis, blob) {
  const r = await fetch(`${url}?id=${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ basis, blob }) });
  if (r.status === 409) return { konflikt: true };
  if (!r.ok) throw new Error(await serverFehler(r));
  return r.json(); // { rev }
}
async function serverFehler(r) {
  const t = await r.text().catch(() => "");
  try { return JSON.parse(t).fehler || `Server ${r.status}`; } catch { return r.status === 501 ? "sync.php läuft nur auf dem Webspace (nicht im Dev-Server)" : `Server ${r.status}`; }
}

/** Vergleichbare Form (Schlüssel sortiert) */
const kanon = (x) => JSON.stringify(["items", "stamps", "deleted"].map((f) => Object.entries(x[f]).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))));

let laeuft = false;
/** Einmal abgleichen: holen, zusammenführen, ggf. zurückschreiben */
export async function jetztSync() {
  if (!aktiv() || laeuft) return;
  laeuft = true; melde("start");
  try {
    mitschreiben();
    const { id, key } = await ableiten(st.code);
    for (let versuch = 0; versuch < 4; versuch++) {
      const remote = await holen(st.url, id);
      const rstand = remote ? await entschluesseln(key, remote.blob) : { items: {}, stamps: {}, deleted: {} };
      const lokal = { items: flach(store.data), stamps: st.stamps, deleted: st.deleted };
      const gemischt = zusammenfuehren(lokal, rstand);
      const datenNeu = uebernehmen(gemischt);
      const gleichWieServer = remote && kanon(gemischt) === kanon(zusammenfuehren(rstand, { items: {}, stamps: {}, deleted: {} }));
      if (!gleichWieServer) {
        const res = await senden(st.url, id, remote ? remote.rev : 0, await verschluesseln(key, gemischt));
        if (res.konflikt) continue; // anderes Gerät war schneller -> nochmal
        st.rev = res.rev;
      } else st.rev = remote.rev;
      st.last = Date.now(); st.fehler = ""; merke();
      melde(datenNeu ? "daten" : "ok");
      return;
    }
    throw new Error("Zu viele gleichzeitige Änderungen – gleich nochmal");
  } catch (e) {
    st.fehler = navigator.onLine === false ? "offline – wird nachgeholt" : e.message;
    merke(); melde("fehler");
  } finally { laeuft = false; melde("ende"); }
}

/** Neuen Sync starten (erstes Gerät) */
export async function einrichten(url) {
  st = { code: neuerCode(), url: url || standardUrl(), rev: 0, stamps: {}, deleted: {}, snapshot: {}, last: 0, fehler: "" };
  mitschreiben(); merke();
  await jetztSync();
  if (st.fehler) { const f = st.fehler; trennen(); throw new Error(f); }
  return st.code;
}

/**
 * Weiteres Gerät verbinden.
 * modus "ersetzen": Daten auf diesem Gerät werden durch die synchronisierten ersetzt
 * modus "mischen":  beides zusammen; bei Gleichem gewinnt der Sync-Stand
 */
export async function verbinden(code, modus, url) {
  const c = normCode(code);
  if (c.length < 20) throw new Error("Code unvollständig");
  const u = url || standardUrl();
  const { id, key } = await ableiten(c);
  const remote = await holen(u, id);
  if (!remote) throw new Error("Zu diesem Code gibt es noch keinen Sync – Tippfehler?");
  let rstand;
  try { rstand = await entschluesseln(key, remote.blob); } catch { throw new Error("Code passt nicht zu den Daten"); }
  st = { code: c.match(/.{1,4}/g).join("-"), url: u, rev: remote.rev, stamps: {}, deleted: {}, snapshot: {}, last: 0, fehler: "" };
  if (modus === "ersetzen") {
    const leer = { ...store.data, notes: {}, ...Object.fromEntries(LISTEN.map((l) => [l, []])) };
    store.data = leer;
    uebernehmen(rstand);
  } else {
    // lokale Einträge als "uralt" markieren -> bei Gleichem gewinnt der Sync, Neues kommt dazu
    const lokal = flach(store.data);
    const alt = { items: lokal, stamps: Object.fromEntries(Object.keys(lokal).map((k) => [k, 1])), deleted: {} };
    uebernehmen(zusammenfuehren(alt, rstand));
  }
  merke();
  await jetztSync();
  melde("daten");
}

export function trennen() {
  clearTimeout(timer);
  st = null;
  localStorage.removeItem(SKEY);
  melde("ende");
}

/* ---------- automatisch: beim Öffnen, beim Zurückkommen, alle 5 Minuten ---------- */
export function starteAuto() {
  if (aktiv()) jetztSync();
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") jetztSync(); });
  window.addEventListener("online", () => jetztSync());
  setInterval(() => { if (document.visibilityState === "visible") jetztSync(); }, 5 * 60 * 1000);
}
