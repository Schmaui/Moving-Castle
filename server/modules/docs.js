// Modul: Dateien im Ordner der Pinnwand (Verträge, Dokumente, Fotos von Papieren).
//
//   GET    /api/docs                                Liste (kommt auch in /api/state mit)
//   POST   /api/folders/:id/dateien?name=…&note=…   Datei hochladen. Body = die Datei selbst,
//                                                   Content-Type: application/pdf oder image/jpeg
//   GET    /api/docs/:id/datei                      Datei ansehen (nur angemeldet, wie alle /api/-Pfade)
//   PATCH  /api/docs/:id                            Name, Notiz ändern oder verschieben (folderId)
//   DELETE /api/docs/:id                            Datei löschen
//
// Die Dateien liegen in data/ordner/ (mit im Daten-Volume und in den Backups).
// Fotos verkleinert der Browser vorher (js/ui/photos.js -> shrink) – das entfernt auch GPS-Daten.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { registerCrud, actorOf } from '../resource.js';
import { HttpError } from '../http.js';
import { validateField } from '../validate.js';
import { bumpRev, now, transaction } from '../db.js';
import { config } from '../config.js';

const TYPES = {
  pdf: { mime: 'application/pdf', ext: '.pdf', maxBytes: 25 * 1024 * 1024, magic: Buffer.from('%PDF-') },
  jpg: { mime: 'image/jpeg', ext: '.jpg', maxBytes: 8 * 1024 * 1024, magic: Buffer.from([0xff, 0xd8, 0xff]) },
};
const MAX_FILES = 1000;
const NAME = { col: 'name', type: 'text', required: true, max: 120 };
const NOTE = { col: 'note', type: 'text', max: 1000, multiline: true };

export const DOC_DIR = () => path.join(config.dataDir, 'ordner');
export const fileOf = (file) => path.join(DOC_DIR(), path.basename(file));

/** Anzeigename aufräumen: keine Pfade, passende Endung. */
function cleanName(raw, type) {
  const { ext } = TYPES[type];
  let name = String(raw || '').split(/[\\/]/).pop().trim();
  name = name.replace(/\.(pdf|jpe?g|png|heic|heif|webp|gif)$/i, '');
  if (!name) name = type === 'pdf' ? 'Dokument' : 'Foto';
  return validateField(NAME, [...name].slice(0, 110).join('') + ext, 'name');
}

/** Body als Bytes lesen (mit Größengrenze). */
async function readBody(req, maxBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new HttpError(413, `Datei ist zu groß (höchstens ${Math.round(maxBytes / 1024 / 1024)} MB)`);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/** Dateiname für den Download-Kopf (Umlaute über filename*). */
function disposition(name) {
  const ascii = name.replace(/[^A-Za-z0-9._ -]/g, '_');
  return `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

export default {
  name: 'docs',
  inState: true,
  register(ctx) {
    const { db, router } = ctx;
    fs.mkdirSync(DOC_DIR(), { recursive: true });
    // Aufräumen: Früher hingen Dateien an Pinnwand-Zetteln (data/dokumente/).
    // Migration 9 hat diese Test-Einträge entfernt – die Dateien dazu kommen hier weg.
    if (db.prepare('SELECT COUNT(*) AS n FROM note_files').get().n === 0) {
      fs.rmSync(path.join(config.dataDir, 'dokumente'), { recursive: true, force: true });
    }

    router.post('/api/folders/:id/dateien', async ({ req, params, query }) => {
      const folderId = Number(params.id);
      if (!Number.isSafeInteger(folderId) || !db.prepare('SELECT 1 FROM folders WHERE id = ?').get(folderId)) {
        throw new HttpError(404, 'Ordner nicht gefunden');
      }
      const contentType = String(req.headers['content-type'] || '');
      const type = Object.keys(TYPES).find((t) => contentType.startsWith(TYPES[t].mime));
      if (!type) throw new HttpError(415, 'Bitte ein PDF oder ein Foto (JPEG) schicken');
      if (db.prepare('SELECT COUNT(*) AS n FROM docs').get().n >= MAX_FILES) {
        throw new HttpError(409, `Höchstens ${MAX_FILES} Dateien – bitte erst alte löschen`);
      }
      const name = cleanName(query.get('name'), type);
      const note = validateField(NOTE, query.get('note') ?? '', 'note');
      const data = await readBody(req, TYPES[type].maxBytes);
      if (data.length < 100 || !data.subarray(0, TYPES[type].magic.length).equals(TYPES[type].magic)) {
        throw new HttpError(400, type === 'pdf' ? 'Das ist kein PDF' : 'Das ist kein JPEG-Bild');
      }
      const file = crypto.randomBytes(12).toString('hex') + TYPES[type].ext;
      fs.writeFileSync(fileOf(file), data, { mode: 0o640 });
      const ts = now();
      try {
        const id = transaction(db, () => {
          const r = db.prepare(
            'INSERT INTO docs (folder_id, file, name, note, type, size, added_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
          ).run(folderId, file, name, note, type, data.length, actorOf(db, req), ts, ts);
          bumpRev(db);
          return Number(r.lastInsertRowid);
        });
        return { status: 201, body: api.get(id) };
      } catch (err) {
        fs.rmSync(fileOf(file), { force: true });
        throw err;
      }
    });

    router.get('/api/docs/:id/datei', ({ res, params }) => {
      const row = db.prepare('SELECT file, name, type FROM docs WHERE id = ?').get(Number(params.id));
      if (!row) throw new HttpError(404, 'Datei nicht gefunden');
      let data;
      try { data = fs.readFileSync(fileOf(row.file)); } catch { throw new HttpError(404, 'Datei fehlt'); }
      res.writeHead(200, {
        'Content-Type': TYPES[row.type]?.mime || 'application/octet-stream',
        'Content-Length': data.length,
        'Content-Disposition': disposition(row.name),
        'Cache-Control': 'private, max-age=31536000, immutable',
      });
      res.end(data);
      return undefined;
    });

    router.delete('/api/docs/:id', ({ params }) => {
      const existing = api.get(Number(params.id));
      if (!existing) throw new HttpError(404, 'Datei nicht gefunden');
      const row = db.prepare('SELECT file FROM docs WHERE id = ?').get(existing.id);
      transaction(db, () => {
        db.prepare('DELETE FROM docs WHERE id = ?').run(existing.id);
        bumpRev(db);
      });
      fs.rmSync(fileOf(row.file), { force: true });
      return existing;
    });

    // Liste, Einzelabruf und Umbenennen vom generischen Helfer.
    // POST /api/docs gibt es absichtlich nicht (Hochladen geht über /api/folders/:id/dateien).
    router.post('/api/docs', () => { throw new HttpError(405, 'Bitte über /api/folders/:id/dateien hochladen'); });
    const api = registerCrud(ctx, {
      path: '/api/docs',
      table: 'docs',
      orderBy: 'id',
      fields: {
        folderId: { col: 'folder_id', type: 'int', required: true, ref: 'folders' },  // verschieben
        name:    NAME,
        note:    NOTE,
        type:    { col: 'type',     type: 'text', readonly: true },
        size:    { col: 'size',     type: 'int',  readonly: true },
        addedBy: { col: 'added_by', type: 'int',  readonly: true },
      },
      hooks: {
        beforeWrite(values, existing) {
          // Umbenennen: Endung bleibt immer passend zur Datei
          if (existing && 'name' in values) values.name = cleanName(values.name, existing.type);
        },
      },
    });
    return api;
  },
};
