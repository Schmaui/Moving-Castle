// Datenbank-Schema als Liste von Migrationen.
//
// REGELN:
// - Bestehende Einträge NIE ändern (sie sind auf deinem Server schon gelaufen).
// - Für Änderungen einfach einen NEUEN Eintrag ans Ende hängen.
// - Die Datenbank merkt sich in "PRAGMA user_version", welche schon gelaufen sind.
//
// Jede Tabelle sollte id, created_at, updated_at haben – das erwartet
// der generische CRUD-Helfer in resource.js.

export const MIGRATIONS = [
  // 1: Grundgerüst – Kategorien, Artikel, Meta (Revisionszähler)
  `
  CREATE TABLE categories (
    id          INTEGER PRIMARY KEY,
    name        TEXT    NOT NULL,
    emoji       TEXT    NOT NULL DEFAULT '📦',
    sort        INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL,
    updated_at  TEXT    NOT NULL
  );
  CREATE UNIQUE INDEX categories_name ON categories (name COLLATE NOCASE);

  CREATE TABLE items (
    id            INTEGER PRIMARY KEY,
    category_id   INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    name          TEXT    NOT NULL,
    missing       INTEGER NOT NULL DEFAULT 0,   -- 1 = fehlt (steht auf der Einkaufsliste)
    missing_since TEXT,                         -- wann als "fehlt" markiert
    quantity      REAL,                         -- vorbereitet: Menge
    unit          TEXT,                         -- vorbereitet: Einheit (z. B. "kg", "Dose")
    note          TEXT,                         -- vorbereitet: Notiz
    sort          INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT    NOT NULL,
    updated_at    TEXT    NOT NULL
  );
  CREATE UNIQUE INDEX items_category_name ON items (category_id, name COLLATE NOCASE);
  CREATE INDEX items_missing ON items (missing);

  CREATE TABLE meta (
    key   TEXT PRIMARY KEY,
    value TEXT
  );
  INSERT INTO meta (key, value) VALUES ('rev', '0');
  `,

  // 2: Sitzungen für die Anmeldung (nur genutzt, wenn HAUSHALT_PASSWORT gesetzt ist)
  `
  CREATE TABLE sessions (
    token_hash  TEXT PRIMARY KEY,   -- SHA-256 des Cookies (das Cookie selbst wird nie gespeichert)
    created_at  TEXT NOT NULL,
    last_seen   TEXT NOT NULL,
    user_agent  TEXT
  );
  `,

  // 3: Gezeichnete Symbole statt Emojis (Namen siehe public/js/ui/art.js)
  `
  ALTER TABLE categories ADD COLUMN icon TEXT NOT NULL DEFAULT 'kiste';
  UPDATE categories SET icon = 'dose' WHERE emoji = '🥫';
  UPDATE categories SET icon = 'schuessel' WHERE emoji = '🥣';
  UPDATE categories SET icon = 'nudeln' WHERE emoji = '🍝';
  UPDATE categories SET icon = 'gewuerz' WHERE emoji = '🌶️';
  UPDATE categories SET icon = 'broetchen' WHERE emoji = '🥐';
  UPDATE categories SET icon = 'keksdose' WHERE emoji = '🍪';
  UPDATE categories SET icon = 'milch' WHERE emoji = '🧊';
  UPDATE categories SET icon = 'kartoffeln' WHERE emoji = '🥔';
  `,

  // Beispiel für später (auskommentiert lassen, bis du es brauchst):
  // `ALTER TABLE items ADD COLUMN store TEXT;`,
];
