/* =====================================================================
   KALENDER-FEEDS (ICS / webcal)
   Liest Abo-Links aus Apple iCloud, Google, Outlook, Meetup, Clubs …
   Unterstützt: ganztägig, Zeitzonen (TZID), Wiederholungen (RRULE mit
   FREQ/INTERVAL/COUNT/UNTIL/BYDAY/BYMONTHDAY), EXDATE, verschobene Termine.
   ===================================================================== */
import { keyOf, addDays } from "./util.js";

const WIN_TZ = {
  "W. Europe Standard Time": "Europe/Berlin",
  "Central Europe Standard Time": "Europe/Budapest",
  "Romance Standard Time": "Europe/Paris",
  "GMT Standard Time": "Europe/London",
  "Eastern Standard Time": "America/New_York",
  "Pacific Standard Time": "America/Los_Angeles",
};

/** Wandelt eine Wanduhrzeit in Zeitzone tz in einen echten Zeitpunkt um */
function zoned(y, mo, d, h, mi, s, tz) {
  tz = WIN_TZ[tz] || tz;
  let fmt;
  try {
    fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch { return new Date(y, mo - 1, d, h, mi, s); } // unbekannte Zone -> Gerätezeit
  const want = Date.UTC(y, mo - 1, d, h, mi, s);
  let t = want;
  for (let i = 0; i < 2; i++) {
    const p = Object.fromEntries(fmt.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
    const seen = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
    t += want - seen;
  }
  return new Date(t);
}

function parseDT(value, params = {}) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (h === undefined || params.VALUE === "DATE") return { date: new Date(+y, +mo - 1, +d), allDay: true };
  if (z) return { date: new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s || 0))), allDay: false };
  if (params.TZID) return { date: zoned(+y, +mo, +d, +h, +mi, +(s || 0), params.TZID.replace(/^"|"$/g, "")), allDay: false };
  return { date: new Date(+y, +mo - 1, +d, +h, +mi, +(s || 0)), allDay: false };
}

const unescape = (v) => v.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1");

function parseLine(line) {
  // NAME;PARAM=a;PARAM2="x:y":VALUE  – Doppelpunkt in Anführungszeichen ignorieren
  let i = 0, q = false;
  for (; i < line.length; i++) {
    const c = line[i];
    if (c === '"') q = !q;
    else if (c === ":" && !q) break;
  }
  const head = line.slice(0, i), value = line.slice(i + 1);
  const [name, ...ps] = head.split(";");
  const params = {};
  for (const p of ps) { const [k, v = ""] = p.split("="); params[k.toUpperCase()] = v; }
  return { name: name.toUpperCase(), params, value };
}

export function parseICS(text) {
  const lines = text.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
  const out = [];
  let cur = null, nest = 0;
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line) continue;
    if (line === "BEGIN:VEVENT") { cur = { exdates: new Set() }; nest = 0; continue; }
    if (!cur) continue;
    if (line.startsWith("BEGIN:")) { nest++; continue; }
    if (line.startsWith("END:") && line !== "END:VEVENT") { nest--; continue; }
    if (line === "END:VEVENT") { if (cur.start) out.push(cur); cur = null; continue; }
    if (nest > 0) continue; // VALARM usw.
    const { name, params, value } = parseLine(line);
    switch (name) {
      case "UID": cur.uid = value; break;
      case "SUMMARY": cur.title = unescape(value); break;
      case "LOCATION": cur.location = unescape(value); break;
      case "DESCRIPTION": cur.description = unescape(value); break;
      case "URL": cur.url = value; break;
      case "STATUS": cur.status = value.toUpperCase(); break;
      case "RRULE": cur.rrule = Object.fromEntries(value.split(";").map((p) => p.split("=")).map(([k, v]) => [k.toUpperCase(), v])); break;
      case "DTSTART": { const r = parseDT(value, params); if (r) { cur.start = r.date; cur.allDay = r.allDay; } break; }
      case "DTEND": { const r = parseDT(value, params); if (r) cur.end = r.date; break; }
      case "DURATION": cur.duration = value; break;
      case "EXDATE": for (const v of value.split(",")) { const r = parseDT(v, params); if (r) cur.exdates.add(keyOf(r.date)); } break;
      case "RECURRENCE-ID": { const r = parseDT(value, params); if (r) cur.recurrenceKey = keyOf(r.date); break; }
    }
  }
  return out;
}

function durationMs(ev) {
  if (ev.end) return ev.end - ev.start;
  if (ev.duration) {
    const m = /P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?/.exec(ev.duration);
    if (m) return (((+m[1] || 0) * 7 + (+m[2] || 0)) * 86400 + (+m[3] || 0) * 3600 + (+m[4] || 0) * 60 + (+m[5] || 0)) * 1000;
  }
  return ev.allDay ? 86400000 : 3600000;
}

const BYDAY_IDX = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
function parseByDay(s) {
  return (s || "").split(",").filter(Boolean).map((t) => {
    const m = /^([+-]?\d+)?([A-Z]{2})$/.exec(t.trim());
    return m ? { n: m[1] ? +m[1] : 0, wd: BYDAY_IDX[m[2]] } : null;
  }).filter(Boolean);
}
function nthOfMonth(d) { return Math.floor((d.getDate() - 1) / 7) + 1; }
function isLastOfMonth(d) { return addDays(d, 7).getMonth() !== d.getMonth(); }
function mondayIndex(d) { const x = addDays(d, -((d.getDay() + 6) % 7)); return Math.round(Date.UTC(x.getFullYear(), x.getMonth(), x.getDate()) / 86400000); }

function matches(rule, start, d) {
  const iv = Math.max(1, +rule.INTERVAL || 1);
  const byday = parseByDay(rule.BYDAY);
  const dayDiff = Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())) / 86400000);
  const monDiff = (d.getFullYear() - start.getFullYear()) * 12 + d.getMonth() - start.getMonth();
  switch (rule.FREQ) {
    case "DAILY":
      return dayDiff % iv === 0 && (!byday.length || byday.some((b) => b.wd === d.getDay()));
    case "WEEKLY": {
      const wk = (mondayIndex(d) - mondayIndex(start)) / 7;
      if (wk % iv !== 0) return false;
      return byday.length ? byday.some((b) => b.wd === d.getDay()) : d.getDay() === start.getDay();
    }
    case "MONTHLY": {
      if (monDiff % iv !== 0) return false;
      if (byday.length) return byday.some((b) => b.wd === d.getDay() && (b.n === 0 || b.n === nthOfMonth(d) || (b.n === -1 && isLastOfMonth(d))));
      if (rule.BYMONTHDAY) return rule.BYMONTHDAY.split(",").map(Number).includes(d.getDate());
      return d.getDate() === start.getDate();
    }
    case "YEARLY":
      return (d.getFullYear() - start.getFullYear()) % iv === 0 && d.getMonth() === start.getMonth() && d.getDate() === start.getDate();
  }
  return false;
}

/** Einzeltermine im Zeitfenster [from, to] (Date) erzeugen */
export function expand(events, from, to) {
  const overrides = new Set(events.filter((e) => e.recurrenceKey).map((e) => `${e.uid}|${e.recurrenceKey}`));
  const res = [];
  for (const ev of events) {
    if (ev.status === "CANCELLED") continue;
    const dur = durationMs(ev);
    const push = (s) => res.push({ uid: ev.uid, title: ev.title || "(ohne Titel)", location: ev.location || "", url: ev.url || "", description: ev.description || "", allDay: !!ev.allDay, start: s, end: new Date(+s + dur) });
    if (!ev.rrule || ev.recurrenceKey) {
      if (ev.start <= to && new Date(+ev.start + dur) >= from) push(ev.start);
      continue;
    }
    const rule = ev.rrule;
    const u = rule.UNTIL ? parseDT(rule.UNTIL) : null;
    const until = u ? (u.allDay ? new Date(+addDays(u.date, 1) - 1) : u.date) : null;
    const count = rule.COUNT ? +rule.COUNT : Infinity;
    const st = ev.start;
    const earliest = addDays(from, -20 * 366);
    let day = new Date(st.getFullYear(), st.getMonth(), st.getDate());
    if (count === Infinity && day < earliest) day = earliest; // uralte Serien nicht ab Anfang durchzählen
    let n = 0;
    for (let guard = 0; guard < 40000 && day <= to; guard++, day = addDays(day, 1)) {
      if (!matches(rule, st, day)) continue;
      const occ = new Date(day.getFullYear(), day.getMonth(), day.getDate(), st.getHours(), st.getMinutes(), st.getSeconds());
      if (occ < st) continue;
      if (until && occ > until) break;
      n++;
      if (n > count) break;
      const k = keyOf(occ);
      if (ev.exdates.has(k) || overrides.has(`${ev.uid}|${k}`)) continue;
      if (occ <= to && new Date(+occ + dur) >= from) push(occ);
    }
  }
  return res.sort((a, b) => a.start - b.start);
}

/** ICS laden: erst direkt, dann über den eigenen Proxy (wegen CORS) */
export async function fetchICS(url, proxyUrl) {
  const u = url.trim().replace(/^webcal:\/\//i, "https://");
  const tries = [];
  tries.push(() => fetch(u, { cache: "no-store" }));
  if (proxyUrl) tries.push(() => fetch(`${proxyUrl}${proxyUrl.includes("?") ? "&" : "?"}url=${encodeURIComponent(u)}`, { cache: "no-store" }));
  let lastErr;
  for (const t of tries) {
    try {
      const r = await t();
      if (!r.ok) throw new Error("HTTP " + r.status);
      const txt = await r.text();
      if (!txt.includes("BEGIN:VCALENDAR")) throw new Error("Kein Kalender-Format");
      return txt;
    } catch (e) { lastErr = e; }
  }
  throw new Error(proxyUrl ? `Feed nicht ladbar (${lastErr.message})` : "Direkt blockiert (CORS) – Proxy in den Einstellungen eintragen");
}

/** Einzelnes Event als .ics-Datei (zum Eintragen in Apple/Google Kalender) */
export function eventToICS({ title, start, end, location = "", url = "", description = "" }) {
  const f = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const e = (s) => String(s).replace(/[\\,;]/g, (c) => "\\" + c).replace(/\n/g, "\\n");
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//juten Tach!//DE", "CALSCALE:GREGORIAN", "BEGIN:VEVENT",
    `UID:${Date.now()}-${Math.random().toString(36).slice(2)}@tagesblatt`,
    `DTSTAMP:${f(new Date())}`, `DTSTART:${f(start)}`, `DTEND:${f(end || new Date(+start + 3 * 3600000))}`,
    `SUMMARY:${e(title)}`, location && `LOCATION:${e(location)}`, url && `URL:${url}`, description && `DESCRIPTION:${e(description)}`,
    "END:VEVENT", "END:VCALENDAR",
  ].filter(Boolean).join("\r\n");
}
