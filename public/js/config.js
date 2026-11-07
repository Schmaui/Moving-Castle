// Einstellungen für das Frontend.
export const CONFIG = {
  // Name der App (Fenstertitel, Anmeldeseite). Auch in index.html und manifest.webmanifest ändern!
  appName: 'kait & schmauiis moving castle',

  // Wie oft die Geräte nach Änderungen fragen (Millisekunden)
  pollIntervalMs: 4000,
  // Wie lange der "Rückgängig"-Hinweis sichtbar bleibt
  undoDurationMs: 5000,
  // Startseite, wenn keine/unbekannte Adresse aufgerufen wird
  defaultRoute: 'liste',
  // Am PC (ab 1100px) werden diese Ansichten nebeneinander gezeigt:
  // links eine aus main (Vorrat oder Haushalt), rechts aside (Einkaufsliste).
  // Auf null setzen, um immer nur eine Ansicht zu zeigen.
  split: { main: ['vorrat', 'haushalt'], aside: 'liste' },
  // Anzahl der Kategorie-Farbtöne (--tone-1 … --tone-N in css/tokens.css)
  toneCount: 6,
  // Standard-Symbol für neue Kategorien (Name aus js/ui/art.js)
  defaultIcon: 'kiste',
};
