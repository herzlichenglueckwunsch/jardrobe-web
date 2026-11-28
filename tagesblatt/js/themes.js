/* =====================================================================
   THEMES – hier werden alle Looks registriert.
   Neues Theme anlegen:
     1. Ordner themes/<name>/ mit gradient.js (exportiert gradient(datum))
        und theme.css (Regeln unter :root[data-skin="<name>"])
     2. unten in SKINS eintragen
     3. theme.css in index.html verlinken (und in sw.js in die SHELL-Liste)
   ===================================================================== */
import { store } from "./store.js";
import { gradient as jardrobe } from "../themes/jardrobe/gradient.js";
import { gradient as ausjestellt } from "../themes/ausjestellt/gradient.js";

export const SKINS = {
  ausjestellt: { label: "ausjestellt", gradient: ausjestellt, immerDunkel: true },
  jardrobe: { label: "jardrobe", gradient: jardrobe, immerDunkel: false },
};
export const STANDARD_SKIN = "ausjestellt";

export function skinId() {
  const s = store.data.prefs.skin;
  return SKINS[s] ? s : STANDARD_SKIN;
}
export const skin = () => SKINS[skinId()];

/** Verlauf des Tages im aktuell gewählten Look */
export const gradientFor = (date, id = skinId()) => SKINS[id].gradient(date);
