/* =====================================================================
   TAGESBLATT – APP (Ansichten, Navigation, Aktionen)
   ===================================================================== */
import { CONFIG } from "./config.js";
import { store } from "./store.js";
import { gradientFor, skin, skinId, SKINS } from "./themes.js";
import * as U from "./util.js";
import { eventToICS } from "./ics.js";
import { loadMedia, searchPodcasts, links } from "./media.js";
import * as SP from "./spotify.js";
import * as DA from "./data.js";

const VERSION = "1.1.0";
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const D = () => store.data;
const e = U.esc;
const view = $("[data-view]");
let current = { name: "", arg: "" };
let renderedDay = U.todayKey();

/* =========================== Theme & Verlauf =========================== */
function isDark() {
  const t = D().prefs.theme;
  return t === "dunkel" || (t === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
}
function applyDay(k) {
  const g = gradientFor(k);
  const dark = skin().immerDunkel || isDark();
  const r = document.documentElement;
  r.dataset.skin = skinId();
  r.dataset.theme = dark ? "dunkel" : "hell";
  r.style.setProperty("--rahmen", g.rahmen || g.css);
  r.style.setProperty("--leiste-a", g.leisteA || "#121212");
  r.style.setProperty("--leiste-b", g.leisteB || "#121212");
  r.style.setProperty("--akzent", dark ? g.akzentDunkel : g.akzentHell);
  r.style.setProperty("--grad", g.css);
  r.style.setProperty("--tint", dark ? g.tintDunkel : g.tint);
  const meta = $('meta[name="theme-color"]');
  if (meta) meta.content = g.stops[0];
  const tb = $("[data-theme-btn]");
  if (tb) tb.textContent = skinId() === "jardrobe" ? `jardrobe${dark ? " ☾" : ""}` : SKINS[skinId()].label;
  return g;
}

/* =========================== Kleinkram =========================== */
function toast(msg, ms = 2600) {
  const t = $("[data-toast]");
  t.textContent = msg; t.classList.add("on");
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("on"), ms);
}
function download(name, text, mime) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
const save = () => { if (!store.save()) toast("Speicher voll – bitte Backup machen"); };
const card = (title, body, cls = "") => `<section class="card ${cls}"><h2 class="ctitle">${title}</h2>${body}</section>`;
const empty = (t) => `<p class="empty">${t}</p>`;
const katOptions = (sel) => CONFIG.kategorien.map((k) => `<option value="${k.id}" ${k.id === sel ? "selected" : ""}>${e(k.label)}</option>`).join("");
const wtOptions = (sel) => U.WOCHENTAGE.map((w, i) => `<option value="${i}" ${+sel === i ? "selected" : ""}>${w}</option>`).join("");
function timeStr(o) { return o.allDay ? "ganztags" : U.fmtTime(o.start); }

/* =========================== Kopf: Tageskarte =========================== */
function dayCard(k) {
  const d = U.fromKey(k);
  const g = gradientFor(k);
  const cal = DA.calendarFor(k).length, tasks = DA.tasksFor(k).filter((t) => !t.done).length;
  const ev = DA.recommended(k, k).length;
  const bits = [cal && `${cal} Termin${cal > 1 ? "e" : ""}`, tasks && `${tasks} offen`, ev && `${ev} Event${ev > 1 ? "s" : ""}`].filter(Boolean);
  const prev = U.keyOf(U.addDays(d, -1)), next = U.keyOf(U.addDays(d, 1));
  return `<header class="daycard">
    <a class="dc-arrow prev" href="#tag/${prev}" aria-label="Vortag">‹</a>
    <a class="dc-arrow next" href="#tag/${next}" aria-label="Nächster Tag">›</a>
    <div class="dc-top"><span class="hand">${U.weekdayName(d)}${k === U.todayKey() ? "" : " · " + U.relDay(k)}</span><span class="dc-num">Verlauf #${g.nummer}</span></div>
    <h1 class="dc-date">${U.fmtDate(d)}</h1>
    <div class="dc-name hand">${e(g.name)}</div>
    <div class="dc-sum">${bits.length ? bits.join(" · ") : "nichts eingetragen – freier Tag"}</div>
  </header>`;
}

/* =========================== Ansicht: Tag / Heute =========================== */
function planHTML(k) {
  const cal = DA.calendarFor(k).map((o) => ({ sort: o.allDay ? "00:00" : U.fmtTime(o.start), html: `<li class="pl cal"><span class="pt">${timeStr(o)}</span><span class="px">${e(o.title)}${o.location ? `<small>${e(o.location)}</small>` : ""}</span><span class="psrc">${e(o.quelle)}</span></li>` }));
  const tasks = DA.tasksFor(k).map((t) => ({ sort: t.time || "99:99", html: `<li class="pl task ${t.done ? "done" : ""}"><span class="pt">${t.time || "–"}</span><label class="px"><input type="checkbox" data-task-done="${t.id}" ${t.done ? "checked" : ""}> ${e(t.text)}</label><button class="x" data-act="delTask" data-id="${t.id}" aria-label="Löschen">×</button></li>` }));
  const all = [...cal, ...tasks].sort((a, b) => a.sort.localeCompare(b.sort));
  return `<ul class="plan">${all.map((x) => x.html).join("") || `<li class="empty">Noch nichts geplant.</li>`}</ul>
    <form class="row" data-form="addTask" data-k="${k}">
      <input name="q" placeholder="z. B. 14:30 Zahnarzt" autocomplete="off" aria-label="Neuer Eintrag">
      <button class="btn">+</button>
    </form>
    <details class="mini-details"><summary>Für einen anderen Tag vormerken</summary>
      <form class="stack" data-form="vormerken">
        <div class="row"><input type="date" name="date" required value="${U.keyOf(U.addDays(U.fromKey(k), 1))}"><input type="time" name="time"></div>
        <input name="text" placeholder="Was soll an dem Tag auftauchen?" required>
        <button class="btn">Vormerken</button>
      </form>
    </details>`;
}

function upcomingHTML(k) {
  const items = [];
  for (let i = 1; i <= 7; i++) {
    const dk = U.keyOf(U.addDays(U.fromKey(k), i));
    const ts = DA.tasksFor(dk).filter((t) => !t.done);
    const note = D().notes[dk];
    if (ts.length || note) items.push(`<li><a href="#tag/${dk}"><b>${U.relDay(dk)}</b> ${ts.map((t) => e((t.time ? t.time + " " : "") + t.text)).join(" · ")}${note ? `<span class="nsnip">✎ ${e(note.slice(0, 70))}</span>` : ""}</a></li>`);
  }
  return items.length ? `<ul class="uplist">${items.join("")}</ul>` : empty("Die nächsten 7 Tage ist nichts vorgemerkt.");
}

function suggestHTML(k) {
  const s = DA.suggestions(k, 2);
  if (!s.length) return empty(`Noch keine Projekte. <a href="#projekte">Projekt anlegen →</a>`);
  return `<ul class="sug">${s.map(({ p, reasons }) => `<li>
      <div><b>${e(p.name)}</b>${p.naechster ? `<span class="next">Nächster Schritt: ${e(p.naechster)}</span>` : ""}<span class="why">${e(reasons.slice(0, 2).join(" · ") || "gute Gelegenheit")}</span></div>
      <button class="btn sm" data-act="worked" data-id="${p.id}" data-k="${k}">${p.lastWorked === k ? "✓ dran" : "dran gearbeitet"}</button>
    </li>`).join("")}</ul>
    <p class="hint">Busy-Zeit laut Kalender: ${Math.round(DA.busyMinutes(k) / 6) / 10} h</p>`;
}

function eventItem(ev, withDay = false) {
  const url = U.safeUrl(ev.url);
  return `<li class="ev">
    <div class="ev-main">
      <span class="ev-when">${withDay ? U.relDay(U.keyOf(ev.start)) + " · " : ""}${timeStr(ev)}</span>
      <b>${e(ev.title)}</b>
      <small>${[ev.location, DA.katLabel(ev.kategorie), ev.quelle].filter(Boolean).map(e).join(" · ")}</small>
    </div>
    <div class="ev-acts">
      <button class="btn sm" data-act="evMerken" data-ev="${e(ev.id)}">vormerken</button>
      <button class="btn sm ghost" data-act="evIcs" data-ev="${e(ev.id)}" title="In Apple/Google Kalender eintragen">.ics</button>
      ${url ? `<a class="btn sm ghost" href="${e(url)}" target="_blank" rel="noopener">Info</a>` : ""}
    </div></li>`;
}

function mediaTeaser() {
  const c = store.cache.media;
  if (!c || c.day !== U.todayKey()) {
    loadMedia().then(() => { if (current.name === "heute") render(); }).catch(() => {});
    return `<p class="empty">Lade neue Folgen & Hörbücher …</p>`;
  }
  const list = [...c.folgen.slice(0, 3), ...c.hoerbuecher.slice(0, 2)];
  const fallback = !list.length ? [...c.chartsPodcast.slice(0, 2), ...c.chartsHoerbuch.slice(0, 2)] : [];
  const items = (list.length ? list : fallback).map(mediaItem).join("");
  const hint = !D().follows.length ? `<p class="hint">Tipp: unter <a href="#medien">Medien</a> Podcasts & Autor:innen folgen, dann siehst du hier deine Neuerscheinungen.</p>` : "";
  return (items ? `<div class="mlist">${items}</div>` : empty("Heute nichts Neues bei deinen Abos.")) + hint + `<a class="more" href="#medien">alle Medien →</a>`;
}

function viewDay(k) {
  const isToday = k === U.todayKey();
  const evs = isToday ? DA.recommended(k, U.keyOf(U.addDays(U.fromKey(k), 6))) : DA.recommended(k, k);
  return dayCard(k) + `<div class="grid">
    ${card("Tagesplan", planHTML(k), "span2")}
    ${card("Notiz", `<textarea class="note" data-note="${k}" rows="5" placeholder="Gedanken, Ideen, Einkaufsliste … (speichert automatisch)">${e(D().notes[k] || "")}</textarea>`)}
    ${isToday ? card("Demnächst vorgemerkt", upcomingHTML(k)) : ""}
    ${card("Woran arbeiten?", suggestHTML(k))}
    ${isToday ? card("Neu zum Hören", mediaTeaser(), "span2") : ""}
    ${card(isToday ? "Events diese Woche" : "Events an dem Tag", evs.length ? `<ul class="evlist">${evs.slice(0, 5).map((x) => eventItem(x, isToday)).join("")}</ul><a class="more" href="#events">alle Events →</a>` : empty(`Nichts Passendes. <a href="#events">Präferenzen & Partyreihen →</a>`))}
    ${!isToday ? `<p class="center"><a class="btn" href="#heute">← zurück zu heute</a></p>` : ""}
  </div>`;
}

/* =========================== Ansicht: Medien =========================== */
function mediaItem(m) {
  const isNew = m.date && new Date(m.date).getTime() > (D().meta.prevMediaVisit || 0) && !m.platz;
  const q = m.typ === "hoerbuch" ? `${m.title} ${m.autor || ""}` : m.show || m.title;
  const apple = U.safeUrl(m.apple);
  const spKey = e(JSON.stringify({ typ: m.typ, title: m.title, autor: m.autor, show: m.show }));
  return `<article class="mitem">
    ${m.artwork ? `<img src="${e(m.artwork)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<div class="noart"></div>`}
    <div class="mbody">
      <div class="mmeta">${m.platz ? `<span class="badge ghost">#${m.platz}</span>` : ""}${isNew ? `<span class="badge">neu</span>` : ""}<span>${m.typ === "folge" ? "Folge" : m.typ === "podcast" ? "Podcast" : "Hörbuch"}${m.date ? " · " + U.relDay(U.keyOf(new Date(m.date))) : ""}${m.dauer ? ` · ${m.dauer} min` : ""}</span></div>
      <b class="mtitle">${e(m.title)}</b>
      <small>${e(m.sub || "")}</small>
      <div class="avail">
        ${apple ? `<a class="pill ok" href="${e(apple)}" target="_blank" rel="noopener">Apple ✓</a>` : ""}
        ${SP.isConnected() ? `<a class="pill wait" data-sp="${spKey}" href="${e(links.spotifySearch(q))}" target="_blank" rel="noopener">Spotify …</a>` : `<a class="pill" href="${e(links.spotifySearch(q))}" target="_blank" rel="noopener">Spotify ↗</a>`}
        ${m.typ === "hoerbuch" ? `<a class="pill" href="${e(links.audibleSearch(q))}" target="_blank" rel="noopener">Audible ↗</a>` : ""}
      </div>
    </div>
  </article>`;
}

async function runSpotifyChecks() {
  if (!SP.isConnected()) return;
  const els = $$("[data-sp]").slice(0, 20);
  for (const el of els) {
    if (!el.isConnected) return;
    try {
      const res = await SP.checkSpotify(JSON.parse(el.dataset.sp));
      if (!res) { el.textContent = "Spotify ↗"; el.className = "pill"; continue; }
      el.className = "pill " + (res.found ? "ok" : "no");
      el.textContent = res.found ? "Spotify ✓" : "Spotify ✗";
      el.title = res.found ? res.name : "Nicht gefunden – tippen zum Suchen";
      if (res.found && res.url) el.href = res.url;
    } catch (err) { el.textContent = "Spotify ?"; el.className = "pill"; el.title = err.message; if (/429/.test(err.message)) return; }
  }
}

function viewMedia() {
  // "neu" = seit dem letzten Besuch an einem früheren Tag
  const m = D().meta;
  if (U.keyOf(new Date(m.lastMediaVisit || 0)) !== U.todayKey()) { m.prevMediaVisit = m.lastMediaVisit || 0; m.lastMediaVisit = Date.now(); save(); }
  const c = store.cache.media;
  const fresh = c && c.day === U.todayKey();
  if (!fresh) loadMedia().then(() => { if (current.name === "medien") render(); }).catch((err) => toast(err.message));
  const follows = D().follows;
  const vorschlaege = CONFIG.podcastVorschlaege.filter((v) => !follows.some((f) => U.norm(f.term) === U.norm(v)));
  const sect = (title, arr, emptyText) => card(title, arr && arr.length ? `<div class="mlist">${arr.map(mediaItem).join("")}</div>` : empty(emptyText), "span2");
  return `<div class="pagehead"><h1>Hörbücher & Podcasts</h1>
      <div class="row"><span class="hint">${fresh ? `Stand: heute ${U.fmtTime(new Date(c.geladen))}` : "lädt …"}</span><button class="btn sm" data-act="mediaReload">aktualisieren</button></div></div>
    <div class="grid">
    ${card("Ich folge", `
      <div class="chips">${follows.map((f) => `<span class="chip on">${f.type === "podcast" ? "🎙" : "📖"} ${e(f.name || f.term)}<button data-act="unfollow" data-id="${f.id}" aria-label="Entfolgen">×</button></span>`).join("") || `<span class="hint">Noch niemandem.</span>`}</div>
      <form class="stack" data-form="follow">
        <div class="row"><select name="type" aria-label="Art"><option value="podcast">Podcast</option><option value="hoerbuch">Hörbuch: Autor:in / Reihe / Sprecher:in</option></select></div>
        <div class="row"><input name="term" placeholder="Name eingeben" required autocomplete="off"><button class="btn">suchen</button></div>
      </form>
      <div data-search-results></div>
      ${vorschlaege.length ? `<p class="hint">Vorschläge:</p><div class="chips">${vorschlaege.map((v) => `<button class="chip" data-act="followSuggest" data-term="${e(v)}">+ ${e(v)}</button>`).join("")}</div>` : ""}
      <p class="hint">Abgleich: <b>Apple</b> wird direkt geprüft. <b>Spotify</b> ${SP.isConnected() ? "ist verbunden ✓" : `nur mit eigener Client-ID – <a href="#einstellungen">einrichten</a>`}. <b>Audible</b> hat keine offene Schnittstelle, daher nur Suchlink.</p>
    `, "span2")}
    ${sect("Neue Folgen", fresh && c.folgen, follows.some((f) => f.type === "podcast") ? `Keine neuen Folgen in den letzten ${D().prefs.folgenTage} Tagen.` : "Folge Podcasts, um neue Folgen zu sehen.")}
    ${sect("Neue Hörbücher", fresh && c.hoerbuecher, follows.some((f) => f.type === "hoerbuch") ? `Nichts Neues in den letzten ${D().prefs.hoerbuchTage} Tagen.` : "Folge Autor:innen oder Reihen, um Neuerscheinungen zu sehen.")}
    ${sect(`Podcast-Charts ${D().prefs.land.toUpperCase()}`, fresh && c.chartsPodcast, fresh ? "Charts gerade nicht erreichbar." : "lädt …")}
    ${sect(`Hörbuch-Charts ${D().prefs.land.toUpperCase()}`, fresh && c.chartsHoerbuch, fresh ? "Charts gerade nicht erreichbar." : "lädt …")}
    ${fresh && c.fehler.length ? `<p class="hint span2">Hinweise: ${c.fehler.map(e).join(" · ")}</p>` : ""}
  </div>`;
}

/* =========================== Ansicht: Kalender (Monat) =========================== */
function viewMonth(arg) {
  const base = /^\d{4}-\d{2}$/.test(arg || "") ? U.fromKey(arg + "-01") : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const y = base.getFullYear(), mo = base.getMonth();
  const first = new Date(y, mo, 1);
  const startOffset = (first.getDay() + 6) % 7;
  const days = new Date(y, mo + 1, 0).getDate();
  const prev = new Date(y, mo - 1, 1), next = new Date(y, mo + 1, 1);
  const ym = (d) => `${d.getFullYear()}-${U.pad(d.getMonth() + 1)}`;
  const fromK = U.keyOf(first), toK = U.keyOf(new Date(y, mo, days));
  const evByDay = {};
  for (const ev of DA.recommended(fromK, toK)) (evByDay[U.keyOf(ev.start)] ||= []).push(ev);
  const today = U.todayKey();
  let cells = "";
  for (let i = 0; i < startOffset; i++) cells += `<span class="mcell blank"></span>`;
  for (let dnum = 1; dnum <= days; dnum++) {
    const k = U.keyOf(new Date(y, mo, dnum));
    const g = gradientFor(k);
    const n = DA.calendarFor(k).length, t = DA.tasksFor(k).filter((x) => !x.done).length, ev = (evByDay[k] || []).length, note = !!D().notes[k];
    cells += `<a class="mcell ${k === today ? "today" : ""}" href="#tag/${k}" style="--g:${g.css}" title="${e(g.name)}">
      <span class="mnum">${dnum}</span>
      <span class="mdots">${n ? `<i class="d-cal" title="Termine">${n}</i>` : ""}${t ? `<i class="d-task" title="Aufgaben">${t}</i>` : ""}${ev ? `<i class="d-ev" title="Events">★</i>` : ""}${note ? `<i class="d-note" title="Notiz">✎</i>` : ""}</span>
    </a>`;
  }
  return `<div class="pagehead"><h1>${U.monthName(mo)} ${y}</h1>
      <div class="row"><a class="btn sm" href="#kalender/${ym(prev)}">‹</a><a class="btn sm" href="#kalender">heute</a><a class="btn sm" href="#kalender/${ym(next)}">›</a></div></div>
    <div class="month">${["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((w) => `<span class="mhead">${w}</span>`).join("")}${cells}</div>
    <p class="hint legend"><i class="d-cal">2</i> Termine · <i class="d-task">1</i> offene Aufgaben · <i class="d-ev">★</i> Event · <i class="d-note">✎</i> Notiz — jeder Tag hat seinen eigenen Verlauf. Tippen öffnet den Tag.</p>
    ${!D().feeds.some((f) => f.kind === "kalender") ? `<p class="hint">Deine Termine aus Apple/Google-Kalender erscheinen hier, sobald du unter <a href="#einstellungen">Einstellungen</a> einen Kalender-Link einträgst.</p>` : ""}`;
}

/* =========================== Ansicht: Projekte =========================== */
function viewProjects() {
  const k = U.todayKey();
  const ps = [...D().projects].sort((a, b) => (!!a.fertig - !!b.fertig) || b.prio - a.prio);
  const editing = current.edit ? D().projects.find((p) => p.id === current.edit) : null;
  const f = editing || { name: "", prio: 2, aufwand: "mittel", deadline: "", naechster: "" };
  const prio = (n) => "●".repeat(n) + "○".repeat(3 - n);
  return `<div class="pagehead"><h1>Projekte</h1></div><div class="grid">
    ${card(editing ? "Projekt bearbeiten" : "Neues Projekt", `<form class="stack" data-form="project">
      <input type="hidden" name="id" value="${e(editing ? editing.id : "")}">
      <input name="name" placeholder="Projektname" required value="${e(f.name)}">
      <input name="naechster" placeholder="Nächster konkreter Schritt" value="${e(f.naechster || "")}">
      <div class="row">
        <label class="lbl">Priorität <select name="prio">${[1, 2, 3].map((n) => `<option value="${n}" ${+f.prio === n ? "selected" : ""}>${prio(n)}</option>`).join("")}</select></label>
        <label class="lbl">Aufwand <select name="aufwand">${["klein", "mittel", "gross"].map((a) => `<option value="${a}" ${f.aufwand === a ? "selected" : ""}>${a === "gross" ? "groß" : a}</option>`).join("")}</select></label>
      </div>
      <label class="lbl">Deadline (optional) <input type="date" name="deadline" value="${e(f.deadline || "")}"></label>
      <div class="row"><button class="btn">${editing ? "Speichern" : "Anlegen"}</button>${editing ? `<button type="button" class="btn ghost" data-act="cancelEdit">Abbrechen</button>` : ""}</div>
    </form>`)}
    ${card("Heute vorgeschlagen", suggestHTML(k))}
    ${card("Alle Projekte", ps.length ? `<ul class="plist">${ps.map((p) => `<li class="${p.fertig ? "fertig" : ""}">
        <div><b>${e(p.name)}</b>
          <small>${prio(+p.prio)} · ${p.aufwand === "gross" ? "groß" : e(p.aufwand)}${p.deadline ? ` · Deadline ${U.relDay(p.deadline)}` : ""} · ${p.lastWorked ? "zuletzt " + U.relDay(p.lastWorked) : "noch nicht angefangen"}</small>
          ${p.naechster ? `<span class="next">→ ${e(p.naechster)}</span>` : ""}</div>
        <div class="pacts">
          <button class="btn sm" data-act="worked" data-id="${p.id}" data-k="${k}">dran</button>
          <button class="btn sm ghost" data-act="editProject" data-id="${p.id}">✎</button>
          <button class="btn sm ghost" data-act="doneProject" data-id="${p.id}">${p.fertig ? "↺" : "✓ fertig"}</button>
          <button class="btn sm ghost" data-act="delProject" data-id="${p.id}" aria-label="Löschen">×</button>
        </div></li>`).join("")}</ul>` : empty("Noch keine Projekte."), "span2")}
    <p class="hint span2">So entstehen die Vorschläge: Priorität, wie lange ein Projekt liegt, Nähe zur Deadline und wie voll dein Kalender an dem Tag ist (voller Tag → kleine Aufgaben, freier Tag → große).</p>
  </div>`;
}

/* =========================== Ansicht: Events =========================== */
function searchLinks() {
  const p = D().prefs;
  const stadt = (p.stadt || "").trim();
  const slug = U.norm(stadt).replace(/ /g, "-");
  const cats = (p.kategorien.length ? p.kategorien : ["party"]).map(DA.katLabel);
  return `<div class="chips">${cats.map((c) => {
    const q = `${c} Events ${stadt} diese Woche`;
    return `<a class="chip" target="_blank" rel="noopener" href="https://www.google.com/search?q=${encodeURIComponent(q)}">🔎 ${e(c)}</a>`;
  }).join("")}
  ${slug ? `<a class="chip" target="_blank" rel="noopener" href="https://www.eventbrite.de/d/germany--${encodeURIComponent(slug)}/events/">Eventbrite ${e(stadt)}</a>` : ""}
  ${slug ? `<a class="chip" target="_blank" rel="noopener" href="https://www.meetup.com/find/?location=de--${encodeURIComponent(slug)}&source=EVENTS">Meetup ${e(stadt)}</a>` : ""}
  </div>`;
}

function viewEvents() {
  const p = D().prefs;
  const from = U.todayKey(), to = U.keyOf(U.addDays(new Date(), 30));
  const evs = DA.recommended(from, to);
  const groups = {};
  for (const ev of evs) (groups[U.keyOf(ev.start)] ||= []).push(ev);
  const eventFeeds = D().feeds.filter((f) => f.kind === "events");
  return `<div class="pagehead"><h1>Events & Partys</h1></div><div class="grid">
    ${card("Meine Präferenzen", `<form class="stack" data-form="prefs">
      <label class="lbl">Stadt <input name="stadt" value="${e(p.stadt)}"></label>
      <div class="chips">${CONFIG.kategorien.map((k) => `<label class="chip ${p.kategorien.includes(k.id) ? "on" : ""}"><input type="checkbox" name="kat" value="${k.id}" ${p.kategorien.includes(k.id) ? "checked" : ""}>${e(k.label)}</label>`).join("")}</div>
      <label class="lbl">Stichworte (Komma-getrennt) <input name="stichworte" value="${e((p.stichworte || []).join(", "))}"></label>
      <label class="check"><input type="checkbox" name="reihenImmer" ${p.reihenImmer ? "checked" : ""}> Eigene Partyreihen immer anzeigen</label>
      <button class="btn">Speichern</button>
    </form>`)}
    ${card("Mehr finden", `<p class="hint">Schnellsuche nach deinen Kategorien in ${e(p.stadt || "deiner Stadt")}:</p>${searchLinks()}
      <p class="hint">Automatisch: Viele Clubs, Meetup-Gruppen, IHK & Netzwerke bieten einen Kalender-Link (ICS). Den unter <a href="#einstellungen">Einstellungen</a> als „Event-Feed“ eintragen – dann tauchen die Events hier gefiltert nach deinen Präferenzen auf.${eventFeeds.length ? ` Aktiv: ${eventFeeds.map((f) => e(f.name)).join(", ")}.` : ""}</p>`)}
    ${card("Nächste 30 Tage", Object.keys(groups).length ? Object.entries(groups).map(([dk, list]) => `<h3 class="dayhead"><a href="#tag/${dk}">${U.fmtShort(U.fromKey(dk))} · ${U.relDay(dk)}</a></h3><ul class="evlist">${list.map((x) => eventItem(x)).join("")}</ul>`).join("") : empty("Nichts gefunden – Präferenzen anpassen oder Reihen/Feeds hinzufügen."), "span2")}
    ${card("Unsere Partyreihen", `<ul class="plist">${D().series.map((s) => `<li><div><b>${e(s.name)}</b><small>${e(seriesLabel(s))}${s.zeit ? " · " + e(s.zeit) : ""}${s.ort ? " · " + e(s.ort) : ""} · ${e(DA.katLabel(s.kategorie))}</small></div>
        <div class="pacts"><button class="btn sm ghost" data-act="editSeries" data-id="${s.id}">✎</button><button class="btn sm ghost" data-act="delSeries" data-id="${s.id}" aria-label="Löschen">×</button></div></li>`).join("") || `<li class="empty">Noch keine Reihe.</li>`}</ul>
      ${seriesForm()}`)}
    ${card("Eigenes Event eintragen", `<form class="stack" data-form="event">
      <input name="title" placeholder="Titel" required>
      <div class="row"><input type="date" name="date" required value="${U.todayKey()}"><input type="time" name="time"></div>
      <input name="ort" placeholder="Ort">
      <div class="row"><select name="kategorie">${katOptions("party")}</select><input name="url" type="url" placeholder="Link (optional)"></div>
      <button class="btn">Eintragen</button>
    </form>
    ${D().events.length ? `<ul class="plist">${[...D().events].sort((a, b) => a.date.localeCompare(b.date)).map((x) => `<li><div><b>${e(x.title)}</b><small>${U.fmtShort(U.fromKey(x.date))}${x.time ? " " + e(x.time) : ""} · ${e(DA.katLabel(x.kategorie))}</small></div><button class="btn sm ghost" data-act="delEvent" data-id="${x.id}" aria-label="Löschen">×</button></li>`).join("")}</ul>` : ""}`)}
  </div>`;
}
const seriesLabel = DA.seriesLabel;
function seriesForm() {
  const s = current.editSeries ? D().series.find((x) => x.id === current.editSeries) : null;
  const f = s || { name: "", kategorie: "party", rhythmus: "monatlich", nter: 1, wochentag: 6, zeit: "23:00", ort: "", url: "", datum: "" };
  return `<form class="stack" data-form="series">
    <input type="hidden" name="id" value="${e(s ? s.id : "")}">
    <input name="name" placeholder="Name der Reihe" required value="${e(f.name)}">
    <div class="row"><select name="rhythmus">${[["woechentlich", "wöchentlich"], ["monatlich", "monatlich"], ["einmalig", "einmalig"]].map(([v, l]) => `<option value="${v}" ${f.rhythmus === v ? "selected" : ""}>${l}</option>`).join("")}</select>
      <select name="nter" title="Welcher im Monat">${[[1, "1."], [2, "2."], [3, "3."], [4, "4."], [-1, "letzter"]].map(([v, l]) => `<option value="${v}" ${+f.nter === v ? "selected" : ""}>${l}</option>`).join("")}</select>
      <select name="wochentag">${wtOptions(f.wochentag)}</select></div>
    <div class="row"><label class="lbl">Datum (nur einmalig) <input type="date" name="datum" value="${e(f.datum || "")}"></label><label class="lbl">Uhrzeit <input type="time" name="zeit" value="${e(f.zeit || "")}"></label></div>
    <div class="row"><input name="ort" placeholder="Ort / Club" value="${e(f.ort || "")}"><select name="kategorie">${katOptions(f.kategorie)}</select></div>
    <input name="url" type="url" placeholder="Link (Insta, RA, Ticket …)" value="${e(f.url || "")}">
    <div class="row"><button class="btn">${s ? "Speichern" : "Reihe hinzufügen"}</button>${s ? `<button type="button" class="btn ghost" data-act="cancelSeries">Abbrechen</button>` : ""}</div>
  </form>`;
}

/* =========================== Ansicht: Einstellungen =========================== */
function viewSettings() {
  const p = D().prefs;
  const feedRow = (f) => {
    const st = DA.feedStatus(f.id);
    const info = !st ? "noch nicht geladen" : st.error ? `Fehler: ${st.error}` : `${st.events.length} Einträge · ${U.fmtTime(new Date(st.fetched))}`;
    return `<li><div><b>${e(f.name)}</b><small>${f.kind === "kalender" ? "Kalender" : "Event-Feed · " + e(DA.katLabel(f.kategorie))} · ${e(info)}</small></div><button class="btn sm ghost" data-act="delFeed" data-id="${f.id}" aria-label="Entfernen">×</button></li>`;
  };
  return `<div class="pagehead"><h1>Einstellungen</h1></div><div class="grid">
    ${card("Darstellung & Region", `<form class="stack" data-form="basic">
      <label class="lbl">Look <select name="skin">${Object.entries(SKINS).map(([id, x]) => `<option value="${id}" ${skinId() === id ? "selected" : ""}>${e(x.label)}</option>`).join("")}</select></label>
      <label class="lbl">Hell/Dunkel (nur jardrobe-Look) <select name="theme">${[["auto", "Automatisch (wie iPhone)"], ["hell", "Hell"], ["dunkel", "Dunkel"]].map(([v, l]) => `<option value="${v}" ${p.theme === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      <label class="lbl">Store-Land <select name="land">${["de", "at", "ch"].map((l) => `<option ${p.land === l ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      <div class="row"><label class="lbl">Folgen „neu“ (Tage) <input type="number" min="1" max="60" name="folgenTage" value="${p.folgenTage}"></label>
      <label class="lbl">Hörbücher „neu“ (Tage) <input type="number" min="7" max="365" name="hoerbuchTage" value="${p.hoerbuchTage}"></label></div>
      <button class="btn">Speichern</button></form>`)}
    ${card("Kalender & Event-Feeds", `<ul class="plist">${D().feeds.map(feedRow).join("") || `<li class="empty">Noch kein Feed.</li>`}</ul>
      <form class="stack" data-form="feed">
        <input name="name" placeholder="Name (z. B. Privat, Arbeit, Club X)" required>
        <input name="url" placeholder="webcal://… oder https://….ics" required autocomplete="off">
        <div class="row"><select name="kind"><option value="kalender">Mein Kalender (Tagesplan)</option><option value="events">Event-Feed (Empfehlungen)</option></select><select name="kategorie">${katOptions("party")}</select></div>
        <div class="row"><button class="btn">Hinzufügen</button><button type="button" class="btn ghost" data-act="reloadFeeds">alle neu laden</button></div>
      </form>
      <details class="mini-details"><summary>Wo finde ich den Link?</summary>
        <p><b>Apple iCloud:</b> Kalender-App am Mac oder icloud.com → Kalender → Teilen-Symbol → „Öffentlicher Kalender“ an → Link kopieren.</p>
        <p><b>Google:</b> calendar.google.com → Einstellungen → Kalender wählen → „Privatadresse im iCal-Format“.</p>
        <p><b>Outlook:</b> Einstellungen → Kalender → Freigegebene Kalender → Kalender veröffentlichen → ICS-Link.</p>
        <p>Die Links bleiben nur auf diesem Gerät gespeichert. Wer den Link kennt, kann den Kalender lesen – also nicht teilen.</p>
      </details>`, "span2")}
    ${card("Proxy für Kalender-Links", `<p class="hint">Apple & Google erlauben Browsern nicht, Kalender direkt von fremden Seiten abzurufen (CORS). Lade dafür die Datei <code>ics-proxy.php</code> mit auf deinen Webspace und trag hier ihre Adresse ein.</p>
      <form class="row" data-form="proxy"><input name="proxyUrl" placeholder="https://deine-domain.de/tagesblatt/ics-proxy.php" value="${e(p.proxyUrl)}"><button class="btn">OK</button></form>`)}
    ${card("Spotify-Abgleich", `<p class="hint">Optional. Auf <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noopener">developer.spotify.com</a> eine App anlegen (Web API), als Redirect-URI genau das eintragen:</p>
      <p><code class="copy" data-act="copy" data-text="${e(SP.redirectUri())}">${e(SP.redirectUri())}</code></p>
      <form class="row" data-form="spotify"><input name="spotifyClientId" placeholder="Client-ID" value="${e(p.spotifyClientId)}" autocomplete="off"><button class="btn">OK</button></form>
      <p>${SP.isConnected() ? `<span class="pill ok">verbunden</span> <button class="btn sm ghost" data-act="spDisconnect">trennen</button>` : `<button class="btn sm" data-act="spConnect" ${p.spotifyClientId ? "" : "disabled"}>Mit Spotify verbinden</button>`}</p>`)}
    ${card("Apple Erinnerungen", `<p class="hint">Eine Web-App darf leider nicht auf Apple Erinnerungen zugreifen – das geht erst mit der späteren App-Store-Version. Bis dahin: Aufgaben direkt hier im Tagesplan eintragen oder „vormerken“. Mit <b>.ics</b> an Events kannst du Termine in den Apple-Kalender übernehmen.</p>`)}
    ${card("Sichern & Umziehen", `<p class="hint">Alles liegt nur auf diesem Gerät. Mach ab und zu ein Backup (z. B. in iCloud Drive).</p>
      <div class="row"><button class="btn" data-act="export">Backup speichern</button><label class="btn ghost">Backup laden<input type="file" accept="application/json,.json" data-import hidden></label></div>
      <p><button class="btn sm ghost danger" data-act="reset">Alles zurücksetzen</button></p>
      <p class="hint">Tagesblatt ${VERSION}</p>`)}
  </div>`;
}

/* =========================== Router =========================== */
const NAV = [["heute", "Heute"], ["kalender", "Kalender"], ["medien", "Medien"], ["projekte", "Projekte"], ["events", "Events"]];
function route() {
  const [name, arg] = (location.hash.slice(1) || "heute").split("/");
  const changed = name !== current.name || arg !== current.arg;
  if (changed) Object.assign(current, { name, arg, edit: null, editSeries: null });
  render();
  if (changed) window.scrollTo(0, 0);
}
let noteTimer;
function flushNote() {
  const t = $("[data-note]");
  if (!noteTimer || !t) return;
  clearTimeout(noteTimer); noteTimer = null;
  if (t.value.trim()) D().notes[t.dataset.note] = t.value; else delete D().notes[t.dataset.note];
  save();
}
/** Fokus & Cursor über ein Neu-Zeichnen retten (z. B. wenn Daten im Hintergrund nachladen) */
function focusKey() {
  const a = document.activeElement;
  if (!a || !view.contains(a)) return null;
  if (a.matches("[data-note]")) return { sel: `[data-note="${a.dataset.note}"]`, pos: a.selectionStart };
  const f = a.closest("[data-form]");
  if (f && a.name) return { sel: `[data-form="${f.dataset.form}"] [name="${a.name}"]`, pos: a.selectionStart };
  return null;
}
function render() {
  flushNote();
  const fk = focusKey();
  const { name, arg } = current;
  const dayK = name === "tag" && U.isKey(arg) ? arg : U.todayKey();
  if (dayK === U.todayKey() && name === "tag") { location.replace("#heute"); return; }
  applyDay(dayK);
  renderedDay = U.todayKey();
  $$("[data-nav] a").forEach((a) => a.classList.toggle("active", a.dataset.r === (name === "tag" ? "kalender" : name)));
  const html = {
    heute: () => viewDay(U.todayKey()),
    tag: () => viewDay(dayK),
    medien: viewMedia,
    kalender: () => viewMonth(arg),
    projekte: viewProjects,
    events: viewEvents,
    einstellungen: viewSettings,
  }[name] || (() => viewDay(U.todayKey()));
  view.innerHTML = html();
  const g = gradientFor(dayK);
  $("[data-foot]").innerHTML = `<span class="hand">${e(g.name)}</span> · Verlauf #${g.nummer} (${e(g.modus)}) · Daten bleiben auf diesem Gerät`;
  if (fk) {
    const el = $(fk.sel, view);
    if (el) {
      el.focus();
      try { if (fk.pos != null) el.setSelectionRange(fk.pos, fk.pos); } catch { /* nicht jedes Feld kann das */ }
    }
  }
  if (name === "medien" || name === "heute") runSpotifyChecks();
}

/* =========================== Aktionen =========================== */
function findEvent(id) {
  const from = U.keyOf(U.addDays(new Date(), -1)), to = U.keyOf(U.addDays(new Date(), 400));
  if (current.name === "tag" && U.isKey(current.arg)) return DA.allEvents(current.arg < from ? current.arg : from, to).find((x) => x.id === id);
  return DA.allEvents(from, to).find((x) => x.id === id);
}
const ACT = {
  delTask: (el) => { D().tasks = D().tasks.filter((t) => t.id !== el.dataset.id); save(); render(); },
  worked: (el) => {
    const p = D().projects.find((x) => x.id === el.dataset.id); if (!p) return;
    const k = el.dataset.k;
    if (p.lastWorked === k) p.lastWorked = p.prevWorked || null; // Rückgängig
    else { p.prevWorked = p.lastWorked; p.lastWorked = k; }
    save(); render();
    if (p.lastWorked) toast("Stark. Weiter so ✓");
  },
  evMerken: (el) => {
    const ev = findEvent(el.dataset.ev); if (!ev) return toast("Event nicht gefunden");
    D().tasks.push({ id: U.uid(), date: U.keyOf(ev.start), time: ev.allDay ? "" : U.fmtTime(ev.start), text: `★ ${ev.title}${ev.location ? " @ " + ev.location : ""}`, done: false });
    save(); toast(`Vorgemerkt für ${U.relDay(U.keyOf(ev.start))}`); render();
  },
  evIcs: (el) => {
    const ev = findEvent(el.dataset.ev); if (!ev) return;
    download(`${U.norm(ev.title).replace(/ /g, "-") || "event"}.ics`, eventToICS({ title: ev.title, start: ev.start, end: ev.end, location: ev.location, url: U.safeUrl(ev.url), description: "Aus dem Tagesblatt" }), "text/calendar");
  },
  mediaReload: async () => { toast("Lade …"); try { await loadMedia(true); await DA.loadFeeds(true); render(); toast("Aktualisiert ✓"); } catch (err) { toast(err.message); } },
  unfollow: (el) => { D().follows = D().follows.filter((f) => f.id !== el.dataset.id); save(); delete store.cache.media; store.saveCache(); render(); },
  followSuggest: (el) => { D().follows.push({ id: U.uid(), type: "podcast", term: el.dataset.term }); save(); delete store.cache.media; store.saveCache(); render(); toast("Folge ich – lade Folgen …"); },
  pickPodcast: (el) => {
    const p = JSON.parse(el.dataset.p);
    if (!D().follows.some((f) => f.collectionId === p.collectionId)) D().follows.push({ id: U.uid(), type: "podcast", term: p.name, collectionId: p.collectionId, name: p.name, artwork: p.artwork });
    save(); delete store.cache.media; store.saveCache(); render(); toast(`${p.name} gefolgt ✓`);
  },
  editProject: (el) => { current.edit = el.dataset.id; render(); window.scrollTo(0, 0); },
  cancelEdit: () => { current.edit = null; render(); },
  doneProject: (el) => { const p = D().projects.find((x) => x.id === el.dataset.id); if (p) { p.fertig = !p.fertig; save(); render(); } },
  delProject: (el) => { if (confirm("Projekt löschen?")) { D().projects = D().projects.filter((p) => p.id !== el.dataset.id); save(); render(); } },
  editSeries: (el) => { current.editSeries = el.dataset.id; render(); },
  cancelSeries: () => { current.editSeries = null; render(); },
  delSeries: (el) => { if (confirm("Reihe löschen?")) { D().series = D().series.filter((s) => s.id !== el.dataset.id); save(); render(); } },
  delEvent: (el) => { D().events = D().events.filter((x) => x.id !== el.dataset.id); save(); render(); },
  delFeed: (el) => { if (confirm("Feed entfernen?")) { D().feeds = D().feeds.filter((f) => f.id !== el.dataset.id); save(); DA.loadFeeds().then(render); } },
  reloadFeeds: async () => { toast("Lade Feeds …"); const errs = await DA.loadFeeds(true); render(); toast(errs.length ? errs[0] : "Feeds aktualisiert ✓", 4000); },
  spConnect: () => SP.connect().catch((err) => toast(err.message)),
  spDisconnect: () => { SP.disconnect(); render(); },
  copy: (el) => { navigator.clipboard?.writeText(el.dataset.text).then(() => toast("Kopiert ✓"), () => toast("Bitte manuell kopieren")); },
  export: () => download(`tagesblatt-backup-${U.todayKey()}.json`, store.exportJSON(), "application/json"),
  reset: () => { if (confirm("Wirklich ALLES löschen (Notizen, Projekte, Feeds …)?")) { store.reset(); SP.disconnect(); render(); toast("Zurückgesetzt"); } },
};

const FORMS = {
  addTask: (f, fd) => {
    const q = fd.get("q").trim(); if (!q) return;
    const { time, text } = DA.parseQuick(q);
    D().tasks.push({ id: U.uid(), date: f.dataset.k, time, text, done: false }); save(); render();
    $('[data-form="addTask"] input')?.focus();
  },
  vormerken: (f, fd) => {
    const date = fd.get("date"); if (!U.isKey(date)) return;
    D().tasks.push({ id: U.uid(), date, time: fd.get("time") || "", text: fd.get("text").trim(), done: false });
    save(); toast(`Vorgemerkt für ${U.relDay(date)} ✓`); render();
  },
  follow: async (f, fd) => {
    const term = fd.get("term").trim(), type = fd.get("type"); if (!term) return;
    if (type === "hoerbuch") {
      D().follows.push({ id: U.uid(), type, term, name: term }); save(); delete store.cache.media; store.saveCache(); render(); toast("Gefolgt – lade Hörbücher …");
      return;
    }
    const box = $("[data-search-results]");
    box.innerHTML = `<p class="hint">Suche bei Apple Podcasts …</p>`;
    try {
      const res = await searchPodcasts(term);
      box.innerHTML = res.length ? `<ul class="picklist">${res.map((p) => `<li><button data-act="pickPodcast" data-p="${e(JSON.stringify(p))}">${p.artwork ? `<img src="${e(p.artwork)}" alt="">` : ""}<span><b>${e(p.name)}</b><small>${e(p.artist)}</small></span><span class="plus">+</span></button></li>`).join("")}</ul>` : empty("Nichts gefunden.");
    } catch (err) { box.innerHTML = empty("Apple Podcasts nicht erreichbar: " + e(err.message)); }
  },
  project: (f, fd) => {
    const obj = { name: fd.get("name").trim(), naechster: fd.get("naechster").trim(), prio: +fd.get("prio"), aufwand: fd.get("aufwand"), deadline: fd.get("deadline") || "" };
    const id = fd.get("id");
    if (id) Object.assign(D().projects.find((p) => p.id === id) || {}, obj);
    else D().projects.push({ id: U.uid(), lastWorked: null, ...obj });
    current.edit = null; save(); render(); toast("Gespeichert ✓");
  },
  prefs: (f, fd) => {
    const p = D().prefs;
    p.stadt = fd.get("stadt").trim();
    p.kategorien = fd.getAll("kat");
    p.stichworte = fd.get("stichworte").split(",").map((s) => s.trim()).filter(Boolean);
    p.reihenImmer = fd.get("reihenImmer") === "on";
    save(); render(); toast("Präferenzen gespeichert ✓");
  },
  series: (f, fd) => {
    const obj = Object.fromEntries(["name", "rhythmus", "nter", "wochentag", "datum", "zeit", "ort", "kategorie", "url"].map((k) => [k, (fd.get(k) || "").trim()]));
    obj.nter = +obj.nter; obj.wochentag = +obj.wochentag;
    if (obj.rhythmus === "einmalig" && !U.isKey(obj.datum)) return toast("Bitte Datum für einmalige Reihe wählen");
    const id = fd.get("id");
    if (id) Object.assign(D().series.find((s) => s.id === id) || {}, obj); else D().series.push({ id: U.uid(), ...obj });
    current.editSeries = null; save(); render(); toast("Reihe gespeichert ✓");
  },
  event: (f, fd) => {
    D().events.push({ id: U.uid(), title: fd.get("title").trim(), date: fd.get("date"), time: fd.get("time") || "", ort: fd.get("ort").trim(), kategorie: fd.get("kategorie"), url: fd.get("url").trim() });
    save(); render(); toast("Event eingetragen ✓");
  },
  basic: (f, fd) => {
    const p = D().prefs, oldLand = p.land;
    p.theme = fd.get("theme"); p.skin = fd.get("skin"); p.land = fd.get("land");
    p.folgenTage = Math.max(1, +fd.get("folgenTage") || 14); p.hoerbuchTage = Math.max(7, +fd.get("hoerbuchTage") || 120);
    delete store.cache.media; if (oldLand !== p.land) delete store.cache.spotify; store.saveCache();
    save(); render(); toast("Gespeichert ✓");
  },
  feed: async (f, fd) => {
    const url = fd.get("url").trim();
    if (!/^(webcal|https?):\/\//i.test(url)) return toast("Link muss mit webcal:// oder https:// anfangen");
    D().feeds.push({ id: U.uid(), name: fd.get("name").trim(), url, kind: fd.get("kind"), kategorie: fd.get("kategorie") });
    save(); toast("Lade Feed …");
    const errs = await DA.loadFeeds(); render(); toast(errs.length ? errs[0] : "Feed geladen ✓", errs.length ? 6000 : 2600);
  },
  proxy: (f, fd) => {
    const u = fd.get("proxyUrl").trim();
    if (u && !/^https:\/\//i.test(u) && !/^\.?\.?\//.test(u)) return toast("Proxy-Adresse muss mit https:// anfangen");
    D().prefs.proxyUrl = u; save(); toast("Gespeichert – lade Feeds …"); DA.loadFeeds(true).then((errs) => { render(); if (errs.length) toast(errs[0], 5000); });
  },
  spotify: (f, fd) => { D().prefs.spotifyClientId = fd.get("spotifyClientId").trim(); save(); render(); toast("Client-ID gespeichert"); },
};

/* =========================== Verkabelung =========================== */
document.addEventListener("click", (ev) => {
  const el = ev.target.closest("[data-act]");
  if (el && ACT[el.dataset.act]) { ev.preventDefault(); ACT[el.dataset.act](el, ev); }
});
document.addEventListener("submit", (ev) => {
  const f = ev.target.closest("[data-form]");
  if (f && FORMS[f.dataset.form]) { ev.preventDefault(); FORMS[f.dataset.form](f, new FormData(f)); }
});
document.addEventListener("input", (ev) => {
  if (ev.target.matches("[data-note]")) { clearTimeout(noteTimer); noteTimer = setTimeout(flushNote, 400); }
});
window.addEventListener("pagehide", flushNote);
document.addEventListener("change", (ev) => {
  const t = ev.target;
  if (t.matches("[data-task-done]")) {
    const task = D().tasks.find((x) => x.id === t.dataset.taskDone);
    if (task) { task.done = t.checked; save(); t.closest("li")?.classList.toggle("done", t.checked); }
  }
  if (t.matches('[data-form="prefs"] input[name="kat"]')) t.closest("label").classList.toggle("on", t.checked);
  if (t.matches("[data-import]") && t.files[0]) {
    t.files[0].text().then((txt) => { store.importJSON(txt); render(); toast("Backup geladen ✓"); }).catch((err) => toast("Import fehlgeschlagen: " + err.message, 5000));
  }
});
// Knopf oben: ausjestellt -> jardrobe hell -> jardrobe dunkel -> ausjestellt
$("[data-theme-btn]").addEventListener("click", () => {
  const p = D().prefs;
  const stufen = [["ausjestellt", p.theme], ["jardrobe", "hell"], ["jardrobe", "dunkel"]];
  const jetzt = skinId() === "ausjestellt" ? 0 : isDark() ? 2 : 1;
  [p.skin, p.theme] = stufen[(jetzt + 1) % stufen.length];
  save(); render();
});
matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => render());

// Neuer Tag? (App lief über Mitternacht oder kommt aus dem Hintergrund)
function dayCheck() {
  if (renderedDay !== U.todayKey()) { render(); }
  if (document.visibilityState === "visible") {
    DA.loadFeeds().then(() => render()).catch(() => {});
  }
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") dayCheck(); });
setInterval(() => { if (renderedDay !== U.todayKey()) render(); }, 60000);

/* =========================== Start =========================== */
(async function start() {
  $("[data-nav]").innerHTML = NAV.map(([r, l]) => `<a href="#${r}" data-r="${r}">${l}</a>`).join("");
  window.addEventListener("hashchange", route);
  const spMsg = await SP.handleRedirect();
  route();
  if (spMsg) toast(spMsg, 4000);
  if (D().feeds.length) DA.loadFeeds().then(() => render()).catch(() => {});
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
})();
