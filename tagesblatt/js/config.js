/* =====================================================================
   TAGESBLATT – STARTWERTE
   Alles hier wird nur beim ALLERERSTEN Öffnen übernommen.
   Danach änderst du alles direkt in der App (wird auf dem Gerät gespeichert).
   ===================================================================== */
export const CONFIG = {
  appName: "Tagesblatt",
  land: "de",            // Store-Land für Apple/Spotify (de, at, ch …)

  // Event-Präferenzen (in der App unter "Events" änderbar)
  prefs: {
    stadt: "Berlin",
    kategorien: ["wirtschaft", "party"],
    stichworte: ["Gründer", "Startup", "Techno"],
    hoerbuchTage: 120,   // Hörbücher gelten so viele Tage als "neu"
    folgenTage: 14,      // Podcast-Folgen gelten so viele Tage als "neu"
  },

  kategorien: [
    { id: "wirtschaft", label: "Wirtschaft" },
    { id: "party",      label: "Party" },
    { id: "konzert",    label: "Konzert" },
    { id: "kultur",     label: "Kultur" },
    { id: "tech",       label: "Tech" },
    { id: "netzwerk",   label: "Netzwerken" },
    { id: "markt",      label: "Markt & Messe" },
    { id: "sport",      label: "Sport" },
  ],

  // Beispiel-Projekte (aus den offenen Punkten der jardrobe-Seite)
  projekte: [
    { name: "jardrobe: Rechtstexte (Impressum, AGB, Versand)", prio: 3, aufwand: "mittel", naechster: "Impressum-Text schreiben" },
    { name: "jardrobe: echte Produktfotos", prio: 2, aufwand: "gross", naechster: "Shooting-Termin klären" },
    { name: "jardrobe: Über-Seite texten", prio: 2, aufwand: "klein", naechster: "Drei Sätze zur Idee" },
    { name: "jardrobe: Snipcart-Key + Launch", prio: 3, aufwand: "klein", naechster: "Test-Key eintragen und Kauf durchspielen" },
  ],

  // Eure Partyreihen – Platzhalter, in der App unter "Events" anpassen
  reihen: [
    { name: "Unsere Partyreihe (Name eintragen)", kategorie: "party", rhythmus: "monatlich", nter: 1, wochentag: 6, zeit: "23:00", ort: "Club eintragen", url: "" },
  ],

  // Podcast-Vorschläge zum schnellen Folgen (Suchbegriffe für Apple Podcasts)
  podcastVorschlaege: ["OMR Podcast", "Handelsblatt Morning Briefing", "Lage der Nation", "Hotel Matze", "Baywatch Berlin"],
};
