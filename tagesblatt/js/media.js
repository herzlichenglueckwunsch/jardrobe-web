/* =====================================================================
   HÖRBÜCHER & PODCASTS
   - Apple: offizielle iTunes-Such-API + Apple-Charts (ohne Schlüssel)
   - Spotify: optional über eigene Client-ID (siehe spotify.js)
   - Audible: hat keine öffentliche API -> nur Suchlink
   ===================================================================== */
import { store } from "./store.js";
import { todayKey } from "./util.js";

let cbn = 0;
/** iTunes-API per JSONP (funktioniert ohne CORS-Freigabe) */
function jsonp(url, timeout = 12000) {
  return new Promise((resolve, reject) => {
    const name = `__tb_cb_${Date.now()}_${++cbn}`;
    const s = document.createElement("script");
    const done = () => { clearTimeout(t); delete window[name]; s.remove(); };
    const t = setTimeout(() => { done(); reject(new Error("Zeitüberschreitung")); }, timeout);
    window[name] = (data) => { done(); resolve(data); };
    s.onerror = () => { done(); reject(new Error("Apple nicht erreichbar")); };
    s.src = `${url}${url.includes("?") ? "&" : "?"}callback=${name}`;
    document.head.appendChild(s);
  });
}
const land = () => store.data.prefs.land || "de";
const it = (path, params) => jsonp(`https://itunes.apple.com/${path}?${new URLSearchParams({ country: land(), ...params })}`);

const art = (u, size = 200) => (u || "").replace(/\/\d+x\d+bb\./, `/${size}x${size}bb.`);

export async function searchPodcasts(term) {
  const r = await it("search", { media: "podcast", entity: "podcast", limit: 8, term });
  return (r.results || []).map((p) => ({ collectionId: p.collectionId, name: p.collectionName, artist: p.artistName, artwork: art(p.artworkUrl600 || p.artworkUrl100), url: p.collectionViewUrl }));
}

async function podcastEpisodes(f) {
  const r = await it("lookup", { id: f.collectionId, entity: "podcastEpisode", limit: 10 });
  return (r.results || []).filter((x) => x.wrapperType === "podcastEpisode" || x.kind === "podcast-episode").map((e) => ({
    id: "ep:" + e.trackId,
    typ: "folge",
    title: e.trackName,
    sub: e.collectionName || f.name,
    show: e.collectionName || f.name,
    date: e.releaseDate,
    dauer: e.trackTimeMillis ? Math.round(e.trackTimeMillis / 60000) : null,
    artwork: art(e.artworkUrl600 || e.artworkUrl160 || f.artwork),
    apple: e.trackViewUrl || e.collectionViewUrl,
  }));
}

async function audiobooksFor(f) {
  const r = await it("search", { media: "audiobook", entity: "audiobook", limit: 25, term: f.term });
  return (r.results || []).map((b) => ({
    id: "ab:" + b.collectionId,
    typ: "hoerbuch",
    title: b.collectionName,
    sub: b.artistName,
    autor: b.artistName,
    date: b.releaseDate,
    artwork: art(b.artworkUrl100),
    apple: b.collectionViewUrl,
    quelle: f.term,
  }));
}

/** Apple-Charts über den iTunes-RSS-Feed. Der schickt eine CORS-Freigabe,
    der neuere RSS-Generator (rss.applemarketingtools.com) nicht – den
    blockiert der Browser. Fehler landen über settle() in den Hinweisen. */
async function charts(kind) {
  const feed = kind === "podcast" ? "toppodcasts" : "topaudiobooks";
  const r = await fetch(`https://itunes.apple.com/${land()}/rss/${feed}/limit=15/json`);
  if (!r.ok) throw new Error("Charts HTTP " + r.status);
  const j = await r.json();
  let entries = (j.feed && j.feed.entry) || [];
  if (!Array.isArray(entries)) entries = [entries]; // bei nur einem Eintrag kein Array
  const lbl = (x) => (x && x.label) || "";
  return entries.map((x, i) => {
    const name = lbl(x["im:name"]);
    const artist = lbl(x["im:artist"]);
    const links = [].concat(x.link || []);
    const alt = links.find((l) => l.attributes && l.attributes.rel === "alternate") || links[0];
    const imgs = [].concat(x["im:image"] || []);
    return {
      id: (kind === "podcast" ? "cp:" : "cb:") + ((x.id && x.id.attributes && x.id.attributes["im:id"]) || i),
      typ: kind === "podcast" ? "podcast" : "hoerbuch",
      platz: i + 1,
      title: name,
      sub: artist,
      autor: artist,
      show: kind === "podcast" ? name : undefined,
      date: lbl(x["im:releaseDate"]) || null,
      artwork: art(lbl(imgs[imgs.length - 1])),
      apple: (alt && alt.attributes && alt.attributes.href) || lbl(x.id),
    };
  });
}

/** Folgt-Einträge ohne ID (z. B. Vorschläge) einmal auflösen */
async function resolveFollows() {
  let changed = false;
  for (const f of store.data.follows) {
    if (f.type === "podcast" && !f.collectionId) {
      try {
        const [p] = await searchPodcasts(f.term);
        if (p) { Object.assign(f, { collectionId: p.collectionId, name: p.name, artwork: p.artwork }); changed = true; }
      } catch { /* später nochmal */ }
    }
  }
  if (changed) store.save();
}

/**
 * Lädt alles neu – höchstens einmal pro Tag, außer force=true.
 * Ergebnis: { day, folgen, hoerbuecher, chartsPodcast, chartsHoerbuch, fehler[] }
 */
export async function loadMedia(force = false) {
  const c = store.cache.media;
  if (!force && c && c.day === todayKey()) return c;
  await resolveFollows();
  const p = store.data.prefs;
  const now = Date.now();
  const fehler = [];
  const settle = async (label, fn) => { try { return await fn(); } catch (e) { fehler.push(`${label}: ${e.message}`); return []; } };

  const pods = store.data.follows.filter((f) => f.type === "podcast" && f.collectionId);
  const books = store.data.follows.filter((f) => f.type === "hoerbuch");

  const [eps, abs, cp, cb] = await Promise.all([
    Promise.all(pods.map((f) => settle(f.name || f.term, () => podcastEpisodes(f)))).then((a) => a.flat()),
    Promise.all(books.map((f) => settle(f.term, () => audiobooksFor(f)))).then((a) => a.flat()),
    settle("Podcast-Charts", () => charts("podcast")),
    settle("Hörbuch-Charts", () => charts("hoerbuch")),
  ]);

  const within = (d, days) => d && now - new Date(d).getTime() <= days * 86400000 && new Date(d).getTime() <= now + 7 * 86400000;
  const uniq = (arr) => [...new Map(arr.map((x) => [x.id, x])).values()];
  const byDate = (a, b) => new Date(b.date || 0) - new Date(a.date || 0);

  const result = {
    day: todayKey(),
    geladen: now,
    folgen: uniq(eps.filter((e) => within(e.date, p.folgenTage || 14))).sort(byDate),
    hoerbuecher: uniq(abs.filter((b) => within(b.date, p.hoerbuchTage || 120))).sort(byDate),
    chartsPodcast: cp,
    chartsHoerbuch: cb,
    fehler,
  };
  store.cache.media = result;
  store.saveCache();
  return result;
}

export const links = {
  spotifySearch: (q) => `https://open.spotify.com/search/${encodeURIComponent(q)}`,
  audibleSearch: (q) => `https://www.audible.de/search?keywords=${encodeURIComponent(q)}`,
};
