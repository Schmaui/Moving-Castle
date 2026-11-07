// Modul: Fotos an der Kühlschranktür (Polaroids).
//
//   GET    /api/photos            Liste (kommt auch in /api/state mit)
//   POST   /api/photos?caption=…  Foto hochladen: Body = JPEG-Datei (Content-Type: image/jpeg)
//   GET    /api/photos/:id/bild   Das Bild selbst (nur angemeldet, wie alle /api/-Pfade)
//   PATCH  /api/photos/:id        Bildunterschrift oder Reihenfolge ändern
//   DELETE /api/photos/:id        Foto abnehmen (Datei wird gelöscht)
//
// Die Bilder liegen in data/fotos/ (mit im Daten-Volume, also auch in Backups).
// Der Browser verkleinert Fotos vor dem Hochladen (js/ui/photos.js) – das spart
// Platz und entfernt nebenbei Ortsdaten (GPS) aus den Bildern.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { registerCrud } from '../resource.js';
import { HttpError } from '../http.js';
import { validateField } from '../validate.js';
import { bumpRev, now, transaction } from '../db.js';
import { config } from '../config.js';

const MAX_BYTES = 4 * 1024 * 1024;  // 4 MB pro Foto (verkleinert sind es meist ~300 KB)
const MAX_PHOTOS = 100;
const CAPTION = { col: 'caption', type: 'text', max: 60 };

export const PHOTO_DIR = () => path.join(config.dataDir, 'fotos');

export default {
  name: 'photos',
  inState: true,
  register(ctx) {
    const { db, router } = ctx;
    const dir = PHOTO_DIR();
    fs.mkdirSync(dir, { recursive: true });
    const fileOf = (row) => path.join(dir, path.basename(row.file));

    // Eigene Routen VOR registerCrud anmelden – sie haben dann Vorrang.
    router.post('/api/photos', async ({ req, query }) => {
      if (!String(req.headers['content-type'] || '').startsWith('image/jpeg')) {
        throw new HttpError(415, 'Bitte ein JPEG-Bild schicken');
      }
      const count = db.prepare('SELECT COUNT(*) AS n FROM photos').get().n;
      if (count >= MAX_PHOTOS) throw new HttpError(409, `Höchstens ${MAX_PHOTOS} Fotos – bitte erst eins abnehmen`);

      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > MAX_BYTES) throw new HttpError(413, 'Foto ist zu groß');
        chunks.push(chunk);
      }
      const data = Buffer.concat(chunks);
      // Echte JPEG-Datei? (beginnt immer mit FF D8 FF)
      if (data.length < 100 || data[0] !== 0xff || data[1] !== 0xd8 || data[2] !== 0xff) {
        throw new HttpError(400, 'Das ist kein JPEG-Bild');
      }
      const caption = validateField(CAPTION, query.get('caption') ?? '', 'caption');
      const file = crypto.randomBytes(12).toString('hex') + '.jpg';
      fs.writeFileSync(path.join(dir, file), data, { mode: 0o640 });

      const ts = now();
      const sort = (db.prepare('SELECT MAX(sort) AS m FROM photos').get().m ?? -1) + 1;
      try {
        const id = transaction(db, () => {
          const r = db.prepare('INSERT INTO photos (file, caption, sort, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
            .run(file, caption, sort, ts, ts);
          bumpRev(db);
          return Number(r.lastInsertRowid);
        });
        return { status: 201, body: api.get(id) };
      } catch (err) {
        fs.rmSync(path.join(dir, file), { force: true });
        throw err;
      }
    });

    router.get('/api/photos/:id/bild', ({ res, params }) => {
      const row = db.prepare('SELECT file FROM photos WHERE id = ?').get(Number(params.id));
      if (!row) throw new HttpError(404, 'Foto nicht gefunden');
      let data;
      try { data = fs.readFileSync(fileOf(row)); } catch { throw new HttpError(404, 'Foto-Datei fehlt'); }
      res.writeHead(200, {
        'Content-Type': 'image/jpeg',
        'Content-Length': data.length,
        // Bild ändert sich nie (neue ID bei neuem Foto) -> darf lange im Browser bleiben
        'Cache-Control': 'private, max-age=31536000, immutable',
      });
      res.end(data);
      return undefined;
    });

    router.delete('/api/photos/:id', ({ params }) => {
      const existing = api.get(Number(params.id));
      if (!existing) throw new HttpError(404, 'Foto nicht gefunden');
      const row = db.prepare('SELECT file FROM photos WHERE id = ?').get(existing.id);
      transaction(db, () => {
        db.prepare('DELETE FROM photos WHERE id = ?').run(existing.id);
        bumpRev(db);
      });
      fs.rmSync(fileOf(row), { force: true });
      return existing;
    });

    // Liste, Einzelabruf und PATCH (Bildunterschrift, Reihenfolge) vom generischen Helfer
    const api = registerCrud(ctx, {
      path: '/api/photos',
      table: 'photos',
      orderBy: 'sort, id',
      fields: {
        caption: CAPTION,
        sort: { col: 'sort', type: 'int', default: 0 },
      },
    });
    return api;
  },
};
