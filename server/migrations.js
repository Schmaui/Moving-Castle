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

  // 7: Kochen – Rezepte, Wochenplan, Wunschzettel, Mengen im Vorrat, Grundzutaten
  `
  ALTER TABLE items ADD COLUMN min_qty REAL;   -- Mindestmenge (optional). Weniger da -> fehlt automatisch

  CREATE TABLE recipes (
    id           INTEGER PRIMARY KEY,
    title        TEXT    NOT NULL,
    ingredients  TEXT    NOT NULL DEFAULT '[]',  -- JSON: [{"qty":400,"unit":"g","name":"Kichererbsen","note":"abgetropft"}]
    steps        TEXT,                           -- ein Schritt pro Zeile
    minutes      INTEGER,                        -- Zeit gesamt
    servings     INTEGER,                        -- Portionen (nur zur Info)
    tags         TEXT    NOT NULL DEFAULT '[]',  -- JSON: ["schnell", "Meal-Prep"]
    favorite     INTEGER NOT NULL DEFAULT 0,     -- Lieblingsgericht
    notes        TEXT,
    source_url   TEXT,
    cooked_count INTEGER NOT NULL DEFAULT 0,
    last_cooked  TEXT,
    created_by   INTEGER REFERENCES people(id) ON DELETE SET NULL,
    created_at   TEXT    NOT NULL,
    updated_at   TEXT    NOT NULL
  );

  -- Gemerkte Zuordnung "Zutat -> Vorratsartikel" (z. B. nudeln -> Penne).
  -- item_id leer = gehört nicht zum Vorrat (kommt dann auf den Wunschzettel)
  CREATE TABLE ingredient_links (
    id          INTEGER PRIMARY KEY,
    name_key    TEXT    NOT NULL UNIQUE,
    item_id     INTEGER REFERENCES items(id) ON DELETE CASCADE,
    created_at  TEXT    NOT NULL,
    updated_at  TEXT    NOT NULL
  );

  -- Wochenplan: pro Abend bis zu 2 Vorschläge (slot 1 und 2), einer davon wird "gewählt"
  CREATE TABLE meals (
    id          INTEGER PRIMARY KEY,
    day         TEXT    NOT NULL,                 -- "JJJJ-MM-TT"
    slot        INTEGER NOT NULL DEFAULT 1,
    recipe_id   INTEGER REFERENCES recipes(id) ON DELETE CASCADE,
    title       TEXT,                             -- statt Rezept einfach Text, z. B. "Reste"
    chosen      INTEGER NOT NULL DEFAULT 0,       -- "Das gibt's"
    cooked      INTEGER NOT NULL DEFAULT 0,
    created_by  INTEGER REFERENCES people(id) ON DELETE SET NULL,
    created_at  TEXT    NOT NULL,
    updated_at  TEXT    NOT NULL
  );
  CREATE UNIQUE INDEX meals_day_slot ON meals (day, slot);

  -- Wunschzettel: Sachen, die man nicht immer da haben will (z. B. Zutaten für ein Rezept)
  CREATE TABLE wishes (
    id          INTEGER PRIMARY KEY,
    name        TEXT    NOT NULL,
    amount      TEXT,                             -- z. B. "400 ml"
    recipe_id   INTEGER REFERENCES recipes(id) ON DELETE SET NULL,
    added_by    INTEGER REFERENCES people(id) ON DELETE SET NULL,
    created_at  TEXT    NOT NULL,
    updated_at  TEXT    NOT NULL
  );

  -- Grundzutaten ergänzen (nur bei schon bestehendem Vorrat –
  -- neue Installationen bekommen sie direkt aus startdaten.json)
  INSERT INTO categories (name, emoji, icon, sort, created_at, updated_at)
    SELECT 'Backen & Süßes', '🍯', 'honig', (SELECT MAX(sort) + 1 FROM categories), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE EXISTS (SELECT 1 FROM categories)
      AND NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Backen & Süßes' COLLATE NOCASE);
  INSERT INTO categories (name, emoji, icon, sort, created_at, updated_at)
    SELECT 'Soßen', '🍶', 'flasche', (SELECT MAX(sort) + 1 FROM categories), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE EXISTS (SELECT 1 FROM categories)
      AND NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Soßen' COLLATE NOCASE);

  INSERT INTO items (category_id, name, sort, created_at, updated_at)
    SELECT c.id, v.name, 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    FROM categories c,
      (SELECT 'Mehl' AS name UNION ALL SELECT 'Zucker' UNION ALL SELECT 'Backpulver' UNION ALL
       SELECT 'Hefe' UNION ALL SELECT 'Speisestärke' UNION ALL SELECT 'Vanillezucker') v
    WHERE c.name = 'Backen & Süßes'
      AND NOT EXISTS (SELECT 1 FROM items i WHERE i.name = v.name COLLATE NOCASE);
  INSERT INTO items (category_id, name, sort, created_at, updated_at)
    SELECT c.id, v.name, 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    FROM categories c,
      (SELECT 'Sojasoße' AS name UNION ALL SELECT 'Tomatenmark' UNION ALL SELECT 'Kokosmilch') v
    WHERE c.name = 'Soßen'
      AND NOT EXISTS (SELECT 1 FROM items i WHERE i.name = v.name COLLATE NOCASE);
  UPDATE items SET category_id = (SELECT id FROM categories WHERE name = 'Backen & Süßes'), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE name = 'Ahornsirup' AND EXISTS (SELECT 1 FROM categories WHERE name = 'Backen & Süßes')
      AND NOT EXISTS (SELECT 1 FROM items i, categories c WHERE c.name = 'Backen & Süßes' AND i.category_id = c.id AND i.name = 'Ahornsirup');
  UPDATE items SET category_id = (SELECT id FROM categories WHERE name = 'Soßen'), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE name IN ('Mayo', 'Ketchup', 'Salsa') AND EXISTS (SELECT 1 FROM categories WHERE name = 'Soßen')
      AND NOT EXISTS (SELECT 1 FROM items i, categories c WHERE c.name = 'Soßen' AND i.category_id = c.id AND i.name = items.name);
  -- Olivenöl zu den Gewürzen (dort, wo Salz steht), Reis zu den Nudeln (dort, wo Penne steht)
  INSERT INTO items (category_id, name, sort, created_at, updated_at)
    SELECT category_id, 'Olivenöl', 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now') FROM items WHERE name = 'Salz'
      AND NOT EXISTS (SELECT 1 FROM items WHERE name = 'Olivenöl' COLLATE NOCASE) LIMIT 1;
  INSERT INTO items (category_id, name, sort, created_at, updated_at)
    SELECT category_id, 'Reis', 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now') FROM items WHERE name = 'Penne'
      AND NOT EXISTS (SELECT 1 FROM items WHERE name = 'Reis' COLLATE NOCASE) LIMIT 1;
  `,

  // 8: Pinnwand – Zettel (frei, WLAN, Nummern, Dokument) und angehängte Dateien (PDF/Foto)
  `
  CREATE TABLE notes (
    id          INTEGER PRIMARY KEY,
    kind        TEXT    NOT NULL DEFAULT 'zettel',  -- zettel | wlan | nummern | dokument
    title       TEXT    NOT NULL,
    body        TEXT,                               -- Notiz (mehrzeilig)
    secret      TEXT,                               -- WLAN-Passwort, PIN, Code … (wird verdeckt angezeigt)
    data        TEXT,                               -- JSON: WLAN-Netz bzw. Liste der Nummern
    sort        INTEGER NOT NULL DEFAULT 0,
    created_by  INTEGER REFERENCES people(id) ON DELETE SET NULL,
    created_at  TEXT    NOT NULL,
    updated_at  TEXT    NOT NULL
  );

  CREATE TABLE note_files (
    id          INTEGER PRIMARY KEY,
    note_id     INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    file        TEXT    NOT NULL,                   -- Dateiname in data/dokumente/
    name        TEXT    NOT NULL,                   -- angezeigter Name, z. B. "Mietvertrag.pdf"
    type        TEXT    NOT NULL,                   -- pdf | jpg
    size        INTEGER NOT NULL DEFAULT 0,
    added_by    INTEGER REFERENCES people(id) ON DELETE SET NULL,
    created_at  TEXT    NOT NULL,
    updated_at  TEXT    NOT NULL
  );
  CREATE INDEX note_files_note ON note_files (note_id);

  -- Notfall-Nummern schon mal anpinnen
  INSERT INTO notes (kind, title, data, sort, created_at, updated_at) VALUES ('nummern', 'Notfälle',
    '{"entries":[{"name":"Feuerwehr & Rettungsdienst","number":"112"},{"name":"Polizei","number":"110"},{"name":"Ärztlicher Bereitschaftsdienst","number":"116117"},{"name":"Karten sperren (Sperr-Notruf)","number":"116116"}]}',
    0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
  `,

  // 9: Ordner für Dokumente (Unterordner, eine Ebene) statt Dokument-Zettel.
  //    Die bisherigen Dokument-Zettel waren nur Tests (laut Nutzern) und fallen weg;
  //    angehängte Dateien an Zetteln gibt es nicht mehr (Dateien liegen jetzt im Ordner).
  `
  CREATE TABLE folders (
    id          INTEGER PRIMARY KEY,
    name        TEXT    NOT NULL,
    sort        INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL,
    updated_at  TEXT    NOT NULL
  );
  CREATE UNIQUE INDEX folders_name ON folders (name COLLATE NOCASE);

  CREATE TABLE docs (
    id          INTEGER PRIMARY KEY,
    folder_id   INTEGER NOT NULL REFERENCES folders(id) ON DELETE RESTRICT,
    file        TEXT    NOT NULL,                   -- Dateiname in data/ordner/
    name        TEXT    NOT NULL,                   -- angezeigter Name, z. B. "Mietvertrag.pdf"
    note        TEXT,                               -- z. B. "Kündigungsfrist 3 Monate"
    type        TEXT    NOT NULL,                   -- pdf | jpg
    size        INTEGER NOT NULL DEFAULT 0,
    added_by    INTEGER REFERENCES people(id) ON DELETE SET NULL,
    created_at  TEXT    NOT NULL,
    updated_at  TEXT    NOT NULL
  );
  CREATE INDEX docs_folder ON docs (folder_id);

  INSERT INTO folders (name, sort, created_at, updated_at) VALUES
    ('Verträge', 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    ('Wohnung',  1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

  DELETE FROM note_files;
  DELETE FROM notes WHERE kind = 'dokument';
  `,


  // 10: Haushalt – Kategorien gehören jetzt zu einem Bereich: 'kueche' (Essen) oder 'haushalt'
  //     (Bad, Putzen …). Neue Haushalts-Kategorien nur bei schon bestehendem Vorrat anlegen –
  //     neue Installationen bekommen sie direkt aus startdaten.json.
  `
  ALTER TABLE categories ADD COLUMN area TEXT NOT NULL DEFAULT 'kueche';
  INSERT INTO categories (name, emoji, icon, area, sort, created_at, updated_at)
    SELECT 'Bad & Körperpflege', '🪥', 'zahnpasta', 'haushalt', (SELECT MAX(sort) + 1 FROM categories), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE EXISTS (SELECT 1 FROM categories)
      AND NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Bad & Körperpflege' COLLATE NOCASE);
  INSERT INTO items (category_id, name, sort, created_at, updated_at)
    SELECT c.id, v.name, 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    FROM categories c, (SELECT 'Zahnpasta' AS name UNION ALL SELECT 'Zahnbürsten' UNION ALL SELECT 'Zahnseide' UNION ALL SELECT 'Shampoo' UNION ALL SELECT 'Spülung' UNION ALL SELECT 'Duschgel' UNION ALL SELECT 'Deo' UNION ALL SELECT 'Seife' UNION ALL SELECT 'Klopapier' UNION ALL SELECT 'Taschentücher' UNION ALL SELECT 'Wattepads' UNION ALL SELECT 'Wattestäbchen') v
    WHERE c.name = 'Bad & Körperpflege' AND c.area = 'haushalt'
      AND NOT EXISTS (SELECT 1 FROM items i WHERE i.category_id = c.id AND i.name = v.name COLLATE NOCASE);
  INSERT INTO categories (name, emoji, icon, area, sort, created_at, updated_at)
    SELECT 'Putzen & Wäsche', '🧽', 'putzmittel', 'haushalt', (SELECT MAX(sort) + 1 FROM categories), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE EXISTS (SELECT 1 FROM categories)
      AND NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Putzen & Wäsche' COLLATE NOCASE);
  INSERT INTO items (category_id, name, sort, created_at, updated_at)
    SELECT c.id, v.name, 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    FROM categories c, (SELECT 'Spülmittel' AS name UNION ALL SELECT 'Spülmaschinentabs' UNION ALL SELECT 'Klarspüler' UNION ALL SELECT 'Spülmaschinensalz' UNION ALL SELECT 'Waschmittel' UNION ALL SELECT 'Weichspüler' UNION ALL SELECT 'Allzweckreiniger' UNION ALL SELECT 'Badreiniger' UNION ALL SELECT 'WC-Reiniger' UNION ALL SELECT 'Glasreiniger' UNION ALL SELECT 'Schwämme' UNION ALL SELECT 'Müllbeutel') v
    WHERE c.name = 'Putzen & Wäsche' AND c.area = 'haushalt'
      AND NOT EXISTS (SELECT 1 FROM items i WHERE i.category_id = c.id AND i.name = v.name COLLATE NOCASE);
  INSERT INTO categories (name, emoji, icon, area, sort, created_at, updated_at)
    SELECT 'Haushalt & Sonstiges', '🧻', 'rolle', 'haushalt', (SELECT MAX(sort) + 1 FROM categories), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE EXISTS (SELECT 1 FROM categories)
      AND NOT EXISTS (SELECT 1 FROM categories WHERE name = 'Haushalt & Sonstiges' COLLATE NOCASE);
  INSERT INTO items (category_id, name, sort, created_at, updated_at)
    SELECT c.id, v.name, 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    FROM categories c, (SELECT 'Küchenrolle' AS name UNION ALL SELECT 'Alufolie' UNION ALL SELECT 'Frischhaltefolie' UNION ALL SELECT 'Backpapier' UNION ALL SELECT 'Gefrierbeutel' UNION ALL SELECT 'Batterien' UNION ALL SELECT 'Glühbirnen' UNION ALL SELECT 'Kerzen' UNION ALL SELECT 'Streichhölzer') v
    WHERE c.name = 'Haushalt & Sonstiges' AND c.area = 'haushalt'
      AND NOT EXISTS (SELECT 1 FROM items i WHERE i.category_id = c.id AND i.name = v.name COLLATE NOCASE);
  `,

  // 11: Kalender – je Person ein Apple-Kalender (geheimer Link zum "Öffentlichen Kalender")
  //     + zuletzt geholte Datei. Die App zeigt alle zusammen als einen Kalender.
  `
  CREATE TABLE calendar_feeds (
    id          INTEGER PRIMARY KEY,
    person_id   INTEGER NOT NULL UNIQUE REFERENCES people(id) ON DELETE CASCADE,
    url         TEXT    NOT NULL,                     -- geheim! wird nie an die Geräte geschickt
    name        TEXT,                                 -- z. B. "Kait privat"
    ics         TEXT,                                 -- Inhalt der Kalender-Datei
    synced_at   TEXT,                                 -- zuletzt erfolgreich geholt
    error       TEXT,                                 -- letzter Fehler (oder leer)
    updated_at  TEXT    NOT NULL
  );
  `,

  // 12: Filmabend (Pinnwand) – Merkliste für Filme und Serien.
  //     seen_on leer = noch auf der Merkliste, sonst "Gesehen" (mit Bewertung von beiden).
  `
  CREATE TABLE movies (
    id          INTEGER PRIMARY KEY,
    title       TEXT    NOT NULL,
    kind        TEXT    NOT NULL DEFAULT 'film',      -- film | serie
    service     TEXT,                                 -- netflix | prime | disney | hbo | kino | sonstiges
    note        TEXT,                                 -- z. B. "Tipp von Lea"
    wanted_by   TEXT,                                 -- JSON: [personId, …] – wer will's sehen?
    ratings     TEXT,                                 -- JSON: { "personId": 1..5 } (Popcorn)
    seen_on     TEXT,                                 -- JJJJ-MM-TT, wann geguckt
    added_by    INTEGER REFERENCES people(id) ON DELETE SET NULL,
    created_at  TEXT    NOT NULL,
    updated_at  TEXT    NOT NULL
  );
  `,

  // 13: Nachricht an die Tür – kurzer Gruß an den/die andere, hängt beim Öffnen der App an der
  //     geschlossenen Kühlschranktür. Getippt (body) und/oder gemalt (drawing = Striche als JSON).
  //     Nach 24 Stunden verschwindet sie von selbst (server/modules/messages.js räumt auf).
  `
  CREATE TABLE door_messages (
    id          INTEGER PRIMARY KEY,
    from_person INTEGER REFERENCES people(id) ON DELETE CASCADE,
    to_person   INTEGER REFERENCES people(id) ON DELETE CASCADE,
    body        TEXT,                                 -- getippter Text (Handschrift-Look)
    drawing     TEXT,                                 -- JSON: [{ c: Farbe, p: [x, y, x, y, …] }, …]
    paper       TEXT,                                 -- Farbe des Zettels
    created_at  TEXT    NOT NULL,
    updated_at  TEXT    NOT NULL
  );
  `,

  // Beispiel für später (auskommentiert lassen, bis du es brauchst):
  // `ALTER TABLE items ADD COLUMN store TEXT;`,
];
