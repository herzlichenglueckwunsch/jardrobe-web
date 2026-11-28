/* =====================================================================
   SPOTIFY-ABGLEICH (optional)
   Spotify erlaubt Suchen nur mit Anmeldung. Dafür brauchst du eine eigene,
   kostenlose "App" auf developer.spotify.com (Client-ID, KEIN Secret nötig –
   wir nutzen PKCE, das ist für reine Web-Apps gedacht).
   Redirect-URI dort exakt so eintragen, wie die App sie in den Einstellungen zeigt.
   ===================================================================== */
import { store } from "./store.js";
import { similarity, todayKey } from "./util.js";

const TKEY = "tagesblatt_spotify";
export const redirectUri = () => location.origin + location.pathname;

const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
function randomString(n = 64) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const v = crypto.getRandomValues(new Uint8Array(n));
  return [...v].map((x) => chars[x % chars.length]).join("");
}
function tokens() { try { return JSON.parse(localStorage.getItem(TKEY)) || null; } catch { return null; } }
function setTokens(t) { if (t) localStorage.setItem(TKEY, JSON.stringify(t)); else localStorage.removeItem(TKEY); }

export const isConnected = () => !!tokens();
export function disconnect() { setTokens(null); }

export async function connect() {
  const id = store.data.prefs.spotifyClientId.trim();
  if (!id) throw new Error("Erst Client-ID eintragen");
  const verifier = randomString();
  const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  const state = randomString(16);
  sessionStorage.setItem("tb_sp_verifier", verifier);
  sessionStorage.setItem("tb_sp_state", state);
  location.href = "https://accounts.spotify.com/authorize?" + new URLSearchParams({
    response_type: "code", client_id: id, redirect_uri: redirectUri(),
    code_challenge_method: "S256", code_challenge: challenge, state,
  });
}

async function tokenRequest(body) {
  const r = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: store.data.prefs.spotifyClientId.trim(), ...body }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error_description || j.error || "Spotify-Anmeldung fehlgeschlagen");
  const old = tokens() || {};
  setTokens({ access: j.access_token, refresh: j.refresh_token || old.refresh, exp: Date.now() + (j.expires_in - 60) * 1000 });
}

/** Beim Start aufrufen: verarbeitet die Rückkehr von Spotify (?code=…) */
export async function handleRedirect() {
  const q = new URLSearchParams(location.search);
  if (!q.has("code") && !q.has("error")) return null;
  const clean = () => history.replaceState(null, "", location.pathname + location.hash);
  if (q.get("error")) { clean(); return "Spotify: " + q.get("error"); }
  if (q.get("state") !== sessionStorage.getItem("tb_sp_state")) { clean(); return "Spotify: Anmeldung ungültig (state)"; }
  try {
    await tokenRequest({ grant_type: "authorization_code", code: q.get("code"), redirect_uri: redirectUri(), code_verifier: sessionStorage.getItem("tb_sp_verifier") || "" });
    return "Spotify verbunden ✓";
  } catch (e) { return e.message; }
  finally { sessionStorage.removeItem("tb_sp_verifier"); sessionStorage.removeItem("tb_sp_state"); clean(); }
}

async function accessToken() {
  const t = tokens();
  if (!t) return null;
  if (Date.now() < t.exp) return t.access;
  if (!t.refresh) { setTokens(null); return null; }
  try { await tokenRequest({ grant_type: "refresh_token", refresh_token: t.refresh }); return tokens().access; }
  catch { setTokens(null); return null; }
}

/**
 * Prüft, ob es ein Medium auf Spotify gibt.
 * item.typ: "folge"/"podcast" -> Show suchen, "hoerbuch" -> Hörbuch suchen
 * Ergebnis (gecacht pro Tag): { found: bool, url, name } oder null (nicht verbunden)
 */
export async function checkSpotify(item) {
  const cache = (store.cache.spotify ||= {});
  const key = item.typ === "hoerbuch" ? "ab|" + item.title + "|" + (item.autor || "") : "show|" + (item.show || item.title);
  const hit = cache[key];
  if (hit && hit.day === todayKey()) return hit;
  const token = await accessToken();
  if (!token) return null;
  const isBook = item.typ === "hoerbuch";
  const q = isBook ? `${item.title} ${item.autor || ""}` : item.show || item.title;
  const r = await fetch("https://api.spotify.com/v1/search?" + new URLSearchParams({ q: q.slice(0, 100), type: isBook ? "audiobook" : "show", market: (store.data.prefs.land || "de").toUpperCase(), limit: 5 }), {
    headers: { Authorization: "Bearer " + token },
  });
  if (r.status === 429) throw new Error("Spotify: zu viele Anfragen, später nochmal");
  if (!r.ok) throw new Error("Spotify HTTP " + r.status);
  const j = await r.json();
  const list = ((isBook ? j.audiobooks : j.shows) || {}).items || [];
  const target = isBook ? item.title : item.show || item.title;
  let best = null, bestScore = 0;
  for (const x of list.filter(Boolean)) {
    let s = similarity(target, x.name);
    if (isBook && item.autor && x.authors) s = s * 0.75 + 0.25 * Math.max(0, ...x.authors.map((a) => similarity(item.autor, a.name)));
    if (s > bestScore) { bestScore = s; best = x; }
  }
  const res = { day: todayKey(), found: bestScore >= 0.6, url: best && bestScore >= 0.6 ? best.external_urls.spotify : "", name: best ? best.name : "" };
  cache[key] = res;
  store.saveCache();
  return res;
}
