# juten Tach! – dein Tag auf einen Blick

(Im Repo liegt die App im Ordner `tagesblatt/` – das war der Arbeitstitel.)

**Jeder Tag hat seinen eigenen Farbverlauf**: gleiches Datum = gleicher Verlauf, auf jedem Gerät.
Zwei Looks (oben über den Knopf oder in den Einstellungen umschaltbar):
- **ausjestellt** (Standard): Verlauf als ganzer Hintergrund, schwarze Tafeln, Janz + Space Mono → `themes/ausjestellt/`
- **jardrobe**: Doppelrahmen, harte Schatten, Verlaufskarte, hell oder dunkel → `themes/jardrobe/` + `css/style.css`

Eigenes Theme anlegen: Anleitung oben in `js/themes.js`. Verläufe ansehen: `vorschau.html`.

## Was drin ist
| Bereich | Was es kann |
|---|---|
| **Heute** | Tageskarte mit Verlauf, Tagesplan (Kalender + eigene Einträge), Notiz, „Demnächst vorgemerkt“, Projekt-Vorschläge, neue Hörbücher/Podcasts, Events der Woche |
| **Kalender** | Monatsansicht, jeder Tag im eigenen Verlauf, Markierungen für Termine/Aufgaben/Events/Notizen; Tippen öffnet den Tag (Notizen für beliebige Tage) |
| **Medien** | Podcasts & Autor:innen folgen → neue Folgen/Hörbücher; Apple-Charts DE; Abgleich Apple ✓ / Spotify (optional) / Audible (Suchlink) |
| **Projekte** | Priorität, Aufwand, Deadline, nächster Schritt; tägliche Vorschläge je nach Kalender-Auslastung |
| **Events** | Präferenzen (Kategorien wie Wirtschaft/Party, Stadt, Stichworte), eure Partyreihen (wöchentlich / n-ter Wochentag / einmalig), eigene Events, Event-Feeds; „vormerken“ und `.ics` für den Apple-Kalender |
| **Einstellungen** | Kalender-Links, Proxy, Spotify, Look, **Sync zwischen Geräten**, Backup speichern/laden |

Daten liegen auf dem Gerät (localStorage). Mit **Sync** sind sie auf allen Geräten gleich (siehe unten).

## Hochladen (wie beim Shop)
1. Ordner `tagesblatt/` per FileZilla z. B. nach `public_html/jutentach/` hochladen.
2. Auf dem iPhone in **Safari** öffnen → Teilen → **„Zum Home-Bildschirm“**. Danach startet sie wie eine App (auch offline).
3. HTTPS muss aktiv sein (für Offline-Modus und Spotify).

Nach Änderungen an Dateien in `sw.js` die `VERSION` hochzählen, damit das Handy neu lädt.

## Sync zwischen Geräten
Läuft über `sync.php` auf deinem eigenen Webspace (braucht PHP, wie der Kalender-Proxy).
1. Erstes Gerät: Einstellungen → Sync → **„Sync einrichten“**. Unter „Sync-Code zeigen“ steht dein Code.
2. Jedes weitere Gerät: Einstellungen → Sync → Code eintippen → **„Mit Code verbinden“** (bei neuem Gerät „ersetzen“).
3. Ab dann automatisch: beim Öffnen, kurz nach jeder Änderung und alle 5 Minuten.

- **Synchronisiert:** Notizen, Aufgaben, Projekte, Podcasts & Autor:innen, eigene Events, Partyreihen, Kalender-Links, Einstellungen.
- **Pro Gerät:** abgerufene Folgen/Charts/Kalender (werden neu geladen), Spotify-Anmeldung.
- **Konflikte:** pro Eintrag gewinnt die jüngere Änderung. Zwei Geräte überschreiben sich also nicht gegenseitig, wenn sie Verschiedenes ändern.
- **Sicherheit:** Verschlüsselt wird im Browser (AES-256). Auf dem Server liegt in `sync-daten/` nur unlesbarer Datensalat. Der Code ist der Schlüssel, also nicht weitergeben. Wenn du ihn verlierst: auf einem verbundenen Gerät unter „Sync-Code zeigen“ nachsehen.
- **iPhone:** Safari und die Home-Bildschirm-App haben getrennte Speicher. Richte Sync in der Home-Bildschirm-App ein.
- Den Ordner `sync-daten/` auf dem Server bei Updates **nicht löschen**.

## Kalender verbinden (Apple / Google / Outlook)
Eine Web-App darf **nicht direkt** auf den iPhone-Kalender oder Apple **Erinnerungen** zugreifen. Lösung: Abo-Link (ICS).
- iCloud: icloud.com → Kalender → Teilen → „Öffentlicher Kalender“ → Link kopieren
- Google: Einstellungen → Kalender → „Privatadresse im iCal-Format“
- In der App: Einstellungen → Kalender & Event-Feeds → einfügen.

Browser blockieren solche Links meist (CORS). Dafür liegt `ics-proxy.php` bei: einfach mit hochladen und die Adresse (z. B. `https://deine-domain.de/jutentach/ics-proxy.php`) unter „Proxy“ eintragen. Der Proxy lädt **nur** von freigegebenen Anbietern (Liste oben in der Datei, eigene Club-Domains dort ergänzen). Braucht PHP mit curl, das haben fast alle Webhoster.

## Hörbücher & Podcasts
- **Apple**: offizielle iTunes-Such-API + Apple-Charts, ohne Schlüssel. Wird **einmal pro Tag** beim Öffnen neu geladen (oder per „aktualisieren“).
- **Spotify** (optional): kostenlose App auf developer.spotify.com anlegen, Redirect-URI aus den Einstellungen eintragen, Client-ID einfügen, verbinden. Dann zeigt jedes Medium „Spotify ✓/✗“.
- **Audible**: hat keine öffentliche Schnittstelle → nur Suchlink.

## Projekt-Vorschläge – so wird gewertet
Priorität × 2 + wie lange es liegt (max. +4) + Nähe zur Deadline (bis +5) + Kalender-Auslastung (voller Tag → kleine Aufgaben, freier Tag → große). Bei Gleichstand wechselt es täglich.

## Startwerte
`js/config.js` = Beispiel-Projekte (aus den offenen jardrobe-Punkten), Platzhalter-Partyreihe, Event-Kategorien, Podcast-Vorschläge. Wird nur beim allerersten Öffnen übernommen, danach alles in der App ändern.

## Später: App Store
Die App ist eine PWA, also schon so gebaut, dass man sie mit **Capacitor** in eine iOS-App verpacken kann. Erst dort sind möglich: direkter Zugriff auf Apple Kalender **und Erinnerungen** (EventKit), echte Push-Mitteilungen und Hintergrund-Updates. Dafür braucht es einen Mac mit Xcode und einen Apple-Developer-Account (99 €/Jahr).

## Dateien
```
index.html  manifest.webmanifest  sw.js  ics-proxy.php  sync.php
css/style.css  css/janzeinfach.woff2
js/app.js (Ansichten) · data.js (Plan/Events/Vorschläge) · ics.js (Kalender-Parser)
js/media.js (Apple) · spotify.js · sync.js (Geräte-Sync) · themes.js (Looks) · farbe.js · store.js · util.js · config.js
themes/ausjestellt/ (gradient.js, theme.css, janz.woff2) · themes/jardrobe/gradient.js
vorschau.html (Verlauf-Vorschau zum Bearbeiten) · icons/
```
