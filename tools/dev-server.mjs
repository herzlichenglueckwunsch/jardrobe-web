/* Lokaler Server zum Entwickeln – ohne Abhängigkeiten.
   Start:  npm run dev   (oder: node tools/dev-server.mjs)
   Dann im Browser: http://localhost:8080
   Handy im selben WLAN: die "Im WLAN"-Adresse unten öffnen. */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../tagesblatt");
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".ics": "text/calendar", ".md": "text/plain; charset=utf-8",
};

export function startServer(port = Number(process.env.PORT) || 8080, { quiet = false } = {}) {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (p.endsWith("/")) p += "index.html";
    const file = path.join(ROOT, p);
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    if (file.endsWith(".php")) { res.writeHead(501, { "Content-Type": "text/plain" }).end("PHP läuft nur auf dem Webspace, nicht im Dev-Server"); return; }
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404, { "Content-Type": "text/plain" }).end("Nicht gefunden: " + p); return; }
      res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" }).end(buf);
    });
  });
  return new Promise((resolve) => server.listen(port, () => {
    if (!quiet) {
      console.log(`\n  juten Tach! läuft:  http://localhost:${port}`);
      console.log(`  Verlauf-Vorschau:   http://localhost:${port}/vorschau.html`);
      for (const n of Object.values(os.networkInterfaces()).flat()) {
        if (n && n.family === "IPv4" && !n.internal) console.log(`  Im WLAN (Handy):    http://${n.address}:${port}`);
      }
      console.log("\n  Beenden mit Strg+C\n");
    }
    resolve(server);
  }));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) startServer();
