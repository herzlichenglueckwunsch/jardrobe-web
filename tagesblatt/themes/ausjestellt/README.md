# Theme „ausjestellt“

Angelehnt an ausjestellt.de. Übernommen wurde nur, was dort öffentlich sichtbar ist (Anmeldeseite + `stil.css`):
- Farben: Rot `#e30613`, Lila `#662483`/`#82368c`, Gelb `#dedc00`, Grün `#3aaa35`, Weiß `#f6f6f6`, Grau `#d1d1d1`
- Verläufe: senkrecht, kräftige Farbe → **schwarzes Band** → Farbe → Anthrazit
- Schwarze Tafeln mit 1px-Verlaufsrahmen, graue Zeilen, weiße Leisten, schwarze Knöpfe
- Schrift: `janz.woff2` (deine Janz von ausjestellt.de), Fließtext Space Mono, Satzzeichen aus Comic

Die Tagesverläufe sind **neu**: 12 Druckfarben × 5 Aufbau-Muster, jeder Tag anders. Die Original-Verläufe der Seite kommen nicht vor (wird getestet).

## Anpassen
- **Farben/Muster:** `gradient.js` → `FARBEN` und `MUSTER`. Ergebnis sofort in `vorschau.html` ansehen.
- **Aussehen:** `theme.css`.
- **Deine anderen Verläufe von ausjestellt.de** (die hinter dem Login liegen, die konnte ich nicht sehen): Hex-Werte aus deinen Dateien in `FARBEN` eintragen oder als festes Muster in `MUSTER` ergänzen.
