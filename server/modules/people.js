// Modul: Profile (wir zwei). Jede Person hat einen Namen, eine gezeichnete Figur,
// einen Farbton und optional ein eigenes Profilfoto.
//
//   GET    /api/people               Liste (kommt auch in /api/state mit)
//   PATCH  /api/people/:id           Name, Figur oder Farbton ändern
//   POST   /api/people/:id/bild      Profilfoto hochladen (Body = JPEG-Datei)
//   GET    /api/people/:id/bild      Das Profilfoto selbst
//   DELETE /api/people/:id/bild      Profilfoto entfernen (dann wieder die Figur)
//
// Welche Person ein Gerät gerade benutzt, merkt sich das Gerät selbst
// (public/js/me.js) und schickt es bei jeder Änderung als "X-Person" mit.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { registerCrud } from '../resource.js';
import { HttpError } from '../http.js';
import { readJpeg, sendJpeg } from '../jpeg.js';
import { bumpRev, now, transaction } from '../db.js';
import { PHOTO_DIR } from './photos.js';

// Gezeichnete Figuren – müssen in public/js/ui/art.js existieren (figure: true)
export const FIGURES = ['katze', 'hase', 'frosch', 'baer', 'pilz', 'sonne'];

export default {
  name: 'people',
  inState: true,
  register(ctx) {
    const { db, router } = ctx;
    const dir = PHOTO_DIR();
    const fileOf = (name) => path.join(dir, path.basename(name));
    const getPerson = (rawId) => {
      const row = db.prepare('SELECT * FROM people WHERE id = ?').get(Number(rawId));
      if (!row) throw new HttpError(404, 'Person nicht gefunden');
      return row;
    };
    const setPhoto = (row, file) => {
      transaction(db, () => {
        db.prepare('UPDATE people SET photo = ?, updated_at = ? WHERE id = ?').run(file, now(), row.id);
        bumpRev(db);
      });
      if (row.photo) fs.rmSync(fileOf(row.photo), { force: true }); // altes Bild weg
    };

    router.post('/api/people/:id/bild', async ({ req, params }) => {
      const row = getPerson(params.id);
      const data = await readJpeg(req);
      const file = `profil-${crypto.randomBytes(12).toString('hex')}.jpg`;
      fs.writeFileSync(fileOf(file), data, { mode: 0o640 });
      try {
        setPhoto(row, file);
      } catch (err) {
        fs.rmSync(fileOf(file), { force: true });
        throw err;
      }
      return api.get(row.id);
    });

    router.get('/api/people/:id/bild', ({ res, params }) => {
      const row = getPerson(params.id);
      if (!row.photo) throw new HttpError(404, 'Kein Profilfoto');
      let data;
      try { data = fs.readFileSync(fileOf(row.photo)); } catch { throw new HttpError(404, 'Foto-Datei fehlt'); }
      sendJpeg(res, data);
      return undefined;
    });

    router.delete('/api/people/:id/bild', ({ params }) => {
      const row = getPerson(params.id);
      if (row.photo) setPhoto(row, null);
      return api.get(row.id);
    });

    // Liste und PATCH vom generischen Helfer. Neue Personen anlegen/löschen
    // ist in der App (noch) nicht vorgesehen – es gibt nur uns zwei.
    const api = registerCrud(ctx, {
      path: '/api/people',
      table: 'people',
      orderBy: 'sort, id',
      fields: {
        name:   { col: 'name',   type: 'text', required: true, max: 30 },
        figure: { col: 'figure', type: 'text', values: FIGURES, default: 'katze' },
        tone:   { col: 'tone',   type: 'int',  min: 1, maxValue: 6, default: 1 },
        photo:  { col: 'photo',  type: 'text', readonly: true },  // Dateiname, ändert sich bei neuem Foto
        sort:   { col: 'sort',   type: 'int',  default: 0 },
      },
    });
    return api;
  },
};
