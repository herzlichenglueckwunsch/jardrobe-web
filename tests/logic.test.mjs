/* Logik-Tests (ohne Browser):  npm test
   Prüft Tagesverläufe aller Looks und den Kalender-Import. */
process.env.TZ = "Europe/Berlin";
import { gradient as gradientFor } from "../tagesblatt/themes/jardrobe/gradient.js";
import { gradient as ausjestellt, FARBEN } from "../tagesblatt/themes/ausjestellt/gradient.js";
import { contrast } from "../tagesblatt/js/farbe.js";
import { parseICS, expand, eventToICS } from "../tagesblatt/js/ics.js";
import * as U from "../tagesblatt/js/util.js";
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log("FAIL", m); } };

// --- Verläufe: 730 Tage ---
let minHell = 99, minDunkel = 99, minText = 99, prevHue = null, similar = 0;
const names = new Set();
for (let i = 0; i < 730; i++) {
  const k = U.keyOf(U.addDays(new Date(2026, 0, 1), i));
  const g = gradientFor(k), g2 = gradientFor(k);
  ok(g.css === g2.css, "deterministisch " + k);
  minHell = Math.min(minHell, contrast(g.akzentHell, "#ffffff"));
  minDunkel = Math.min(minDunkel, contrast(g.akzentDunkel, "#0e0e0e"));
  for (const s of g.stops) minText = Math.min(minText, contrast(s, "#121212"));
  ok(/^#[0-9a-f]{6}$/.test(g.akzentHell) && g.stops.every(s => /^#[0-9a-f]{6}$/.test(s)), "hex " + k);
  names.add(g.name);
  if (i > 0) { const a = gradientFor(U.keyOf(U.addDays(new Date(2026,0,1), i-1))); if (a.stops[0] === g.stops[0]) similar++; }
}
console.log({ minHell: minHell.toFixed(2), minDunkel: minDunkel.toFixed(2), minTextOnGradient: minText.toFixed(2), uniqueNames: names.size, identicalNeighbours: similar });
ok(minHell >= 4.5 && minDunkel >= 4.5 && minText >= 4.5, "Kontrast");
console.log("^ jardrobe");

// --- ausjestellt: 2 Jahre ---
{
  const VERBOTEN = ["#e30613 0%, #000000 41.7%, #e30613 79.1%, #3b3a3d 100%", "#82368c 0%, #000000 41.7%, #e30613 79.1%, #3b3a3d 100%"];
  let minAkzent = 99, minLeiste = 99, gleicheNachbarn = 0, ohneSchwarz = 0;
  const css = new Set();
  let prev = null;
  for (let i = 0; i < 730; i++) {
    const k = U.keyOf(U.addDays(new Date(2026, 0, 1), i));
    const g = ausjestellt(k);
    ok(g.css === ausjestellt(k).css, "aj deterministisch " + k);
    ok(!VERBOTEN.some((v) => g.css.includes(v)), "aj kein Original-Verlauf " + k);
    ok(g.farben[0] !== g.farben[1], "aj zwei verschiedene Farben " + k);
    minAkzent = Math.min(minAkzent, contrast(g.akzentHell, "#000000"));
    minLeiste = Math.min(minLeiste, contrast(g.leisteA, "#f6f6f6"), contrast(g.leisteB, "#f6f6f6"));
    if (prev && prev.farben[0] === g.farben[0]) gleicheNachbarn++;
    if (!g.stops.includes("#000000")) ohneSchwarz++;
    css.add(g.css); prev = g;
  }
  console.log({ ausjestellt: { minAkzentAufSchwarz: minAkzent.toFixed(2), minLeiste: minLeiste.toFixed(2), verschiedeneVerlaeufe: css.size, gleicheNachbarn, ohneSchwarzesBand: ohneSchwarz, farben: FARBEN.length } });
  ok(minAkzent >= 4.5, "aj Akzent lesbar"); ok(minLeiste >= 3, "aj Leiste lesbar"); ok(gleicheNachbarn === 0, "aj Nachbartage verschieden"); ok(css.size === 730, "aj jeder Tag eigener Verlauf");
}

// --- ICS ---
const ics = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VTIMEZONE
TZID:Europe/Berlin
END:VTIMEZONE
BEGIN:VEVENT
UID:a1
DTSTART;TZID=Europe/Berlin:20261126T100000
DTEND;TZID=Europe/Berlin:20261126T113000
SUMMARY:Call mit Fio\\, wichtig
LOCATION:Zoom
BEGIN:VALARM
TRIGGER:-PT15M
DESCRIPTION:Alarm-nicht-uebernehmen
END:VALARM
END:VEVENT
BEGIN:VEVENT
UID:w1
DTSTART;TZID=Europe/Berlin:20261005T090000
DTEND;TZID=Europe/Berlin:20261005T093000
RRULE:FREQ=WEEKLY;BYDAY=MO,TH
EXDATE;TZID=Europe/Berlin:20261126T090000
SUMMARY:Standup
END:VEVENT
BEGIN:VEVENT
UID:m1
DTSTART:20260904T210000Z
DURATION:PT5H
RRULE:FREQ=MONTHLY;BYDAY=1FR;COUNT=4
SUMMARY:Monatsparty
END:VEVENT
BEGIN:VEVENT
UID:b1
DTSTART;VALUE=DATE:19900327
DTEND;VALUE=DATE:19900328
RRULE:FREQ=YEARLY
SUMMARY:Geburtstag Luisa
END:VEVENT
BEGIN:VEVENT
UID:w1
RECURRENCE-ID;TZID=Europe/Berlin:20261130T090000
DTSTART;TZID=Europe/Berlin:20261130T110000
DTEND;TZID=Europe/Berlin:20261130T113000
SUMMARY:Standup (verschoben)
END:VEVENT
BEGIN:VEVENT
UID:c1
DTSTART:20261127T120000Z
STATUS:CANCELLED
SUMMARY:Abgesagt
END:VEVENT
BEGIN:VEVENT
UID:u1
DTSTART;VALUE=DATE:20261101
RRULE:FREQ=DAILY;INTERVAL=2;UNTIL=20261105
SUMMARY:Alle 2 Tage
END:VEVENT
END:VCALENDAR`.replace(/\n/g, "\r\n");
const evs = parseICS(ics);
ok(evs.length === 7, "7 VEVENTs geparst, war " + evs.length);
ok(evs[0].title === "Call mit Fio, wichtig", "Escape");
ok(!evs[0].description, "VALARM ignoriert");
const occ = expand(evs, new Date(2026, 10, 1), new Date(2026, 11, 31, 23, 59));
const show = (o) => `${U.keyOf(o.start)} ${o.allDay ? "ganztags" : U.fmtTime(o.start)} ${o.title}`;
const L = occ.map(show);
console.log(L.join("\n"));
ok(L.includes("2026-11-26 10:00 Call mit Fio, wichtig"), "TZID Zeit");
ok(!L.includes("2026-11-26 09:00 Standup"), "EXDATE");
ok(L.includes("2026-11-23 09:00 Standup") && L.includes("2026-11-27 09:00 Standup") === false, "BYDAY MO/TH");
ok(L.includes("2026-11-30 11:00 Standup (verschoben)") && !L.includes("2026-11-30 09:00 Standup"), "RECURRENCE-ID");
ok(L.filter(x => x.includes("Monatsparty")).length === 2, "COUNT=4 ab Sep -> Nov+Dez im Fenster");
ok(L.some(x => x.startsWith("2026-11-06") && x.includes("Monatsparty")), "1. Freitag Nov = 6.11.");
ok(!L.some(x => x.includes("Abgesagt")), "CANCELLED");
ok(L.filter(x => x.includes("Alle 2 Tage")).join(",") === ["2026-11-01","2026-11-03","2026-11-05"].map(d=>d+" ganztags Alle 2 Tage").join(","), "UNTIL date-only inkl. letzter Tag");
const bd = expand(evs, new Date(2027, 2, 1), new Date(2027, 2, 31));
ok(bd.some(o => o.title === "Geburtstag Luisa" && U.keyOf(o.start) === "2027-03-27"), "YEARLY seit 1990");
ok(eventToICS({ title: "A, B; C", start: new Date(Date.UTC(2026,10,28,22,0)) }).includes("SUMMARY:A\\, B\\; C"), "Export escape");
ok(eventToICS({ title: "x", start: new Date(Date.UTC(2026,10,28,22,0)) }).includes("DTSTART:20261128T220000Z"), "Export UTC");
// util
ok(U.similarity("Hotel Matze", "Hotel Matze") === 1 && U.similarity("Der Schwarm (ungekürzt)", "Der Schwarm") === 1, "similarity");
console.log(fails ? `\n${fails} FEHLER` : "\nALLE LOGIK-TESTS OK");
if (fails) process.exitCode = 1;

// ===================== Sync: Zusammenführen =====================
{
  const S = await import("../tagesblatt/js/sync.js");
  let f = 0; const ok2 = (c, m) => { if (!c) { f++; console.log("FAIL sync:", m); } };
  const basis = { notes: {}, prefs: { stadt: "Berlin" }, tasks: [], projects: [{ id: "p1", name: "A" }, { id: "p2", name: "B" }], follows: [], feeds: [], events: [], series: [], meta: { x: 1 } };
  const m = S.flach(basis);
  const zurueck = S.aufbauen(m, basis);
  ok2(JSON.stringify(zurueck.projects) === JSON.stringify(basis.projects) && zurueck.meta.x === 1, "flach/aufbauen verlustfrei, meta bleibt");
  const leer = { items: {}, stamps: {}, deleted: {} };
  const N = Date.now() - 10000; // realistische Zeitstempel (alte Grabsteine würden sonst aufgeräumt)
  // A ändert p1 später als B, B legt neue Notiz an, A löscht p2 nach B's Änderung
  const A = { items: { "projects:p1": '{"id":"p1","name":"A neu"}', "prefs:stadt": '"Berlin"' }, stamps: { "projects:p1": N + 300, "prefs:stadt": N + 100 }, deleted: { "projects:p2": N + 250 } };
  const B = { items: { "projects:p1": '{"id":"p1","name":"A alt"}', "projects:p2": '{"id":"p2","name":"B2"}', "notes:2026-11-28": '"Hallo"', "prefs:stadt": '"Hamburg"' }, stamps: { "projects:p1": N + 200, "projects:p2": N + 200, "notes:2026-11-28": N + 210, "prefs:stadt": N + 150 }, deleted: {} };
  const ab = S.zusammenfuehren(A, B), ba = S.zusammenfuehren(B, A);
  ok2(ab.items["projects:p1"].includes("A neu"), "jüngere Änderung gewinnt");
  ok2(!ab.items["projects:p2"] && ab.deleted["projects:p2"] === N + 250, "jüngeres Löschen gewinnt");
  ok2(ab.items["notes:2026-11-28"] === '"Hallo"', "neue Notiz vom anderen Gerät kommt an");
  ok2(ab.items["prefs:stadt"] === '"Hamburg"', "Einstellung: jüngere gewinnt");
  ok2(JSON.stringify(ab) === JSON.stringify(S.zusammenfuehren(ba, leer)) || JSON.stringify(Object.entries(ab.items).sort()) === JSON.stringify(Object.entries(ba.items).sort()), "Reihenfolge egal (A+B = B+A)");
  // Wiederauferstehung: Änderung NACH dem Löschen gewinnt
  const C = { items: { "projects:p2": '{"id":"p2","name":"wieder da"}' }, stamps: { "projects:p2": N + 400 }, deleted: {} };
  ok2(S.zusammenfuehren(ab, C).items["projects:p2"], "Bearbeiten nach Löschen gewinnt");
  // Gleichstand: beide Richtungen gleiches Ergebnis
  const T1 = { items: { "notes:x": '"eins"' }, stamps: { "notes:x": N + 5 }, deleted: {} }, T2 = { items: { "notes:x": '"zwei"' }, stamps: { "notes:x": N + 5 }, deleted: {} };
  ok2(S.zusammenfuehren(T1, T2).items["notes:x"] === S.zusammenfuehren(T2, T1).items["notes:x"], "Gleichstand eindeutig");
  // alte Grabsteine werden aufgeräumt
  ok2(!("tasks:alt" in S.zusammenfuehren({ items: {}, stamps: {}, deleted: { "tasks:alt": 1 } }, leer).deleted), "alte Grabsteine weg");
  ok2(/^([a-z2-9]{4}-){5}[a-z2-9]{4}$/.test(S.neuerCode()), "Code-Format");
  console.log(f ? `${f} SYNC-FEHLER` : "SYNC-LOGIK OK");
  if (f) process.exitCode = 1;
}
