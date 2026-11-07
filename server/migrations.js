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

  // 4: Fotos an der Kühlschranktür (Dateien liegen in data/fotos/)
  `
  CREATE TABLE photos (
    id          INTEGER PRIMARY KEY,
    file        TEXT NOT NULL,          -- Dateiname in data/fotos/
    caption     TEXT,                   -- kleine Bildunterschrift
    sort        INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );
  `,

  // 5: Gemeinsame Einstellungen (Werte als JSON, erlaubte Werte stehen in modules/settings.js)
  `
  CREATE TABLE settings (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );
  `,

  // 6: Profile (wir zwei), "wer hat was gemacht" und Aufgaben
  `
  CREATE TABLE people (
    id          INTEGER PRIMARY KEY,
    name        TEXT    NOT NULL,
    figure      TEXT    NOT NULL DEFAULT 'katze',  -- gezeichnete Figur (public/js/ui/art.js)
    tone        INTEGER NOT NULL DEFAULT 1,        -- Farbton 1–6 (css/tokens.css)
    photo       TEXT,                              -- eigenes Profilfoto in data/fotos/ (optional)
    sort        INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL,
    updated_at  TEXT    NOT NULL
  );
  INSERT INTO people (name, figure, tone, sort, created_at, updated_at) VALUES
    ('Kait',    'katze',  5, 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    ('Schmaui', 'frosch', 1, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

  ALTER TABLE items  ADD COLUMN missing_by INTEGER REFERENCES people(id) ON DELETE SET NULL; -- wer hat's auf die Liste gesetzt
  ALTER TABLE items  ADD COLUMN bought_by  INTEGER REFERENCES people(id) ON DELETE SET NULL; -- wer hat's zuletzt gekauft
  ALTER TABLE items  ADD COLUMN bought_at  TEXT;
  ALTER TABLE photos ADD COLUMN added_by   INTEGER REFERENCES people(id) ON DELETE SET NULL; -- wer hat's aufgehängt

  CREATE TABLE tasks (
    id          INTEGER PRIMARY KEY,
    title       TEXT    NOT NULL,
    note        TEXT,
    due         TEXT,                 -- fällig am "JJJJ-MM-TT" (oder leer = irgendwann)
    repeat      TEXT,                 -- leer, 'taeglich', 'woechentlich', '2wochen', 'monatlich'
    assignee_id INTEGER REFERENCES people(id) ON DELETE SET NULL,  -- leer = egal wer
    created_by  INTEGER REFERENCES people(id) ON DELETE SET NULL,
    done        INTEGER NOT NULL DEFAULT 0,
    done_by     INTEGER REFERENCES people(id) ON DELETE SET NULL,
    done_at     TEXT,
    created_at  TEXT    NOT NULL,
    updated_at  TEXT    NOT NULL
  );
  CREATE INDEX tasks_done ON tasks (done);
  `,

  // Beispiel für später (auskommentiert lassen, bis du es brauchst):
  // `ALTER TABLE items ADD COLUMN store TEXT;`,
];
