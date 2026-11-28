# jardrobe-web – Hinweise für Claude

- Sprache: Deutsch (Code-Kommentare, UI, Commits). Nutzer arbeitet oft vom Handy, teils vom Rechner.
- `tagesblatt/` = App „juten Tach!“ (Arbeitstitel Tagesblatt; Ordner und interne Speicher-Schlüssel `tagesblatt_*` bleiben so, sonst gehen Daten verloren), statische PWA ohne Build (ES-Module, Vanilla JS). Wird per FileZilla auf Shared Hosting geladen → keine Node-Abhängigkeiten zur Laufzeit, nur `ics-proxy.php` serverseitig.
- Looks/Themes: `js/themes.js` (Registry), `themes/<name>/gradient.js` (Tagesverlauf, deterministisch pro Datum), `themes/<name>/theme.css` (Regeln unter `:root[data-skin="<name>"]`). Basis-Layout + jardrobe-Look: `css/style.css`. Standard-Look: ausjestellt.
- Daten: localStorage (`js/store.js`), Backup per JSON. Optionaler Geräte-Sync `js/sync.js` + `sync.php` (Ende-zu-Ende-verschlüsselt, Zusammenführen pro Eintrag per Zeitstempel; Hook `store.onSave`). Neue synchronisierte Listen in `LISTEN` in sync.js eintragen. Neue Felder in `seed()` ergänzen – `migrate()` füllt sie bei Bestandsdaten auf.
- Alle Nutzer-/API-Strings beim Rendern mit `esc()` escapen, Links mit `safeUrl()`.
- Nach Änderungen: `npm test`, `npm run test:browser` und bei Sync-Änderungen `npm run test:sync` (braucht PHP) (Playwright; APIs werden gemockt). Neue Dateien in `tagesblatt/sw.js` → `SHELL` eintragen und `VERSION` hochzählen.
- Grenzen (nicht „wegbauen“): Web-Apps haben keinen Zugriff auf Apple Erinnerungen/iOS-Kalender (→ ICS-Abo + Proxy), Audible hat keine API, Spotify nur mit eigener Client-ID (PKCE).
