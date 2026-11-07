// Generischer CRUD-Helfer: aus einer Felddefinition entstehen automatisch
//   GET    /api/<name>        Liste (Filter per ?feld=wert, z. B. ?missing=true)
//   GET    /api/<name>/:id    Einzelner Eintrag
//   POST   /api/<name>        Neu anlegen
//   PATCH  /api/<name>/:id    Felder ändern (nur die mitgeschickten)
//   DELETE /api/<name>/:id    Löschen (gibt den gelöschten Eintrag zurück -> "Rückgängig")
//
// Ein neuer Bereich (z. B. Aufgaben) braucht also nur: Migration + Felddefinition.
import { HttpError, readJson } from './http.js';
import { validateField, fromDb } from './validate.js';
import { bumpRev, now, transaction } from './db.js';
import { config } from './config.js';

/**
 * Wer macht gerade die Änderung? Jedes Gerät schickt die gewählte Person
 * im Header "X-Person" mit (siehe public/js/me.js). Unbekannt -> null.
 */
export function actorOf(db, req) {
  const id = Number(req?.headers?.['x-person']);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  return db.prepare('SELECT 1 FROM people WHERE id = ?').get(id) ? id : null;
}

/**
 * @param {object} ctx  { db, router }
 * @param {object} def
 *   path     – URL, z. B. '/api/items'
 *   table    – Tabellenname
 *   fields   – { apiName: { col, type, required, max, default, readonly, ref } }
 *   orderBy  – SQL-Sortierung
 *   messages – { duplicate, inUse } eigene Fehlermeldungen
 *   hooks    – { beforeWrite(values, existing, { actor }) } um abgeleitete Felder zu setzen
 *              (actor = id der Person, die gerade etwas ändert, oder null)
 *
 * Nach jedem Anlegen/Ändern/Löschen meldet sich der Helfer auf ctx.events
 * ('write', { table, before, after, actor }) – z. B. für Benachrichtigungen (modules/push.js).
 */
export function registerCrud(ctx, def) {
  const { db, router, events } = ctx;
  const { path, table, fields, orderBy = 'id', hooks = {}, messages = {} } = def;
  const entries = Object.entries(fields);

  const toApi = (row) => {
    const out = { id: Number(row.id) };
    for (const [key, f] of entries) out[key] = fromDb(f, row[f.col]);
    out.createdAt = row.created_at;
    out.updatedAt = row.updated_at;
    return out;
  };

  const selectAll = db.prepare(`SELECT * FROM ${table} ORDER BY ${orderBy}`);
  const selectOne = db.prepare(`SELECT * FROM ${table} WHERE id = ?`);

  const list = () => selectAll.all().map(toApi);
  const get = (id) => {
    const row = selectOne.get(id);
    return row ? toApi(row) : null;
  };
  const getOr404 = (rawId) => {
    const id = Number(rawId);
    const item = Number.isSafeInteger(id) ? get(id) : null;
    if (!item) throw new HttpError(404, 'Nicht gefunden');
    return item;
  };

  /** Body prüfen -> { dbSpalte: wert } */
  function parseBody(body, { isCreate }) {
    const values = {};
    for (const [key, value] of Object.entries(body)) {
      const f = fields[key];
      if (!f || f.readonly) throw new HttpError(400, `Unbekanntes oder schreibgeschütztes Feld: ${key}`);
      values[f.col] = validateField(f, value, key);
    }
    if (isCreate) {
      for (const [key, f] of entries) {
        if (f.readonly || f.col in values) continue;
        if (f.required) throw new HttpError(400, `${key}: Pflichtfeld`);
        if (f.default !== undefined) values[f.col] = f.default;
      }
    }
    // Verweise prüfen (z. B. categoryId muss existieren)
    for (const [key, f] of entries) {
      if (f.ref && values[f.col] != null) {
        const exists = db.prepare(`SELECT 1 FROM ${f.ref} WHERE id = ?`).get(values[f.col]);
        if (!exists) throw new HttpError(400, `${key}: existiert nicht`);
      }
    }
    return values;
  }

  // SQLite-Fehler in verständliche Meldungen übersetzen
  function translateDbError(err) {
    const msg = String(err?.message || '');
    if (msg.includes('UNIQUE')) return new HttpError(409, messages.duplicate || 'Eintrag existiert bereits');
    if (msg.includes('FOREIGN KEY')) return new HttpError(409, messages.inUse || 'Eintrag wird noch verwendet');
    return err;
  }

  function write(fn) {
    try {
      return transaction(db, () => {
        const result = fn();
        bumpRev(db);
        return result;
      });
    } catch (err) {
      throw translateDbError(err);
    }
  }

  // ---- Routen ----
  router.get(path, ({ query }) => {
    let rows = list();
    // Einfache Filter: ?missing=true&categoryId=3
    for (const [key, raw] of query) {
      const f = fields[key];
      if (!f) continue;
      const want = f.type === 'bool' ? raw === 'true' || raw === '1' : f.type === 'int' ? Number(raw) : raw;
      rows = rows.filter((r) => r[key] === want);
    }
    return rows;
  });

  router.get(`${path}/:id`, ({ params }) => getOr404(params.id));

  router.post(path, async ({ req }) => {
    const values = parseBody(await readJson(req, config.maxBodyBytes), { isCreate: true });
    hooks.beforeWrite?.(values, null, { actor: actorOf(db, req) });
    const ts = now();
    values.created_at = ts;
    values.updated_at = ts;
    const cols = Object.keys(values);
    const id = write(() =>
      db.prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`)
        .run(...cols.map((c) => values[c])).lastInsertRowid
    );
    const created = get(Number(id));
    events?.emit('write', { table, before: null, after: created, actor: actorOf(db, req) });
    return { status: 201, body: created };
  });

  router.patch(`${path}/:id`, async ({ req, params }) => {
    const existing = getOr404(params.id);
    const values = parseBody(await readJson(req, config.maxBodyBytes), { isCreate: false });
    hooks.beforeWrite?.(values, existing, { actor: actorOf(db, req) });
    if (Object.keys(values).length === 0) return existing;
    values.updated_at = now();
    const cols = Object.keys(values);
    write(() =>
      db.prepare(`UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`)
        .run(...cols.map((c) => values[c]), existing.id)
    );
    const updated = get(existing.id);
    events?.emit('write', { table, before: existing, after: updated, actor: actorOf(db, req) });
    return updated;
  });

  router.delete(`${path}/:id`, ({ req, params }) => {
    const existing = getOr404(params.id);
    write(() => db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(existing.id));
    events?.emit('write', { table, before: existing, after: null, actor: actorOf(db, req) });
    return existing;
  });

  return { list, get };
}
