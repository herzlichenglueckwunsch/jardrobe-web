/* juten Tach! Service Worker – App läuft auch offline.
   Bei jeder Änderung an den Dateien VERSION hochzählen, damit Handys neu laden. */
const VERSION = "jutentach-v1.3.0";
const SHELL = [
  "./", "index.html", "manifest.webmanifest", "css/style.css", "css/janzeinfach.woff2",
  "js/app.js", "js/config.js", "js/store.js", "js/util.js", "js/farbe.js", "js/themes.js",
  "js/ics.js", "js/media.js", "js/spotify.js", "js/data.js", "js/sync.js",
  "themes/jardrobe/gradient.js", "themes/ausjestellt/gradient.js", "themes/ausjestellt/theme.css", "themes/ausjestellt/janz.woff2",
  "icons/icon.svg", "icons/icon-192.png", "icons/apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // Nur eigene Dateien cachen; APIs (Apple, Spotify, Proxy) immer live
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.endsWith(".php")) return;
  // Netz zuerst (immer aktuell), Cache als Offline-Fallback
  e.respondWith(
    fetch(e.request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match("index.html")))
  );
});
