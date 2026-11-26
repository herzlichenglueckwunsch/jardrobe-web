# jardrobe-web

| Was | Wo |
|---|---|
| jardrobe Shop (Original-Upload) | `jardrobe seite.zip` |
| **Tagesblatt** – Tages-App (Plan, Notizen, Projekte, Hörbücher/Podcasts, Events) | `tagesblatt/` → Details in [`tagesblatt/README.md`](tagesblatt/README.md) |
| Dev-Server, Tests | `tools/`, `tests/`, `package.json` |

## Am Rechner weiterarbeiten

Einmalig:
1. [Node.js](https://nodejs.org) (LTS) installieren, dazu [VS Code](https://code.visualstudio.com) oder einen anderen Editor.
2. Repo holen: `git clone https://github.com/herzlichenglueckwunsch/jardrobe-web.git` (oder in GitHub Desktop „Clone“).
3. Den Branch mit der App auswählen, bis er in `main` gemergt ist: `git checkout claude/audiobook-podcast-planner-lut35e`.
4. Im Ordner: `npm install` und für die Browser-Tests einmal `npx playwright install chromium`.

Jedes Mal:
```bash
npm run dev            # startet http://localhost:8080 (+ Adresse fürs Handy im WLAN)
```
Dann Dateien in `tagesblatt/` ändern und den Browser neu laden. Ein Build-Schritt ist nicht nötig, es sind normale HTML-, CSS- und JS-Dateien.

| Befehl | Was passiert |
|---|---|
| `npm run dev` | lokaler Server, die App läuft unter localhost:8080 |
| `http://localhost:8080/vorschau.html` | alle Tagesverläufe der nächsten Wochen nebeneinander, zum Feintunen der Farben |
| `npm test` | Logik-Tests: Verläufe (Kontrast, jeder Tag anders) und Kalender-Import |
| `npm run test:browser` | klickt die ganze App im Browser durch und speichert Screenshots in `tests/screenshots/` |
| `npm run zip` | packt `tagesblatt/` als `tagesblatt-upload.zip` zum Hochladen |

**Veröffentlichen:** den Inhalt von `tagesblatt/` per FileZilla auf den Webspace laden (z. B. `public_html/tagesblatt/`). Vorher in `tagesblatt/sw.js` die `VERSION` hochzählen, sonst zeigt das Handy noch die alte Version aus dem Cache.

**Mit Claude weitermachen:** Repo in Claude Code öffnen. Die Datei `CLAUDE.md` erklärt Claude den Aufbau.
