// Modul: Nachricht an die Tür – ein kleiner Gruß an den/die andere.
//
//   GET    /api/messages        Liste der letzten 24 Stunden (kommt auch in /api/state mit)
//   POST   /api/messages        Neue Nachricht: { body?, drawing?, paper? } – geht an die andere Person
//   DELETE /api/messages/:id    Abnehmen
//
// Die App zeigt Nachrichten beim Öffnen auf der geschlossenen Kühlschranktür (public/js/ui/door.js).
// Nach 24 Stunden sind sie von selbst weg (werden beim nächsten Abruf gelöscht).
//
// drawing = Striche, mit dem Finger gemalt: [{ c: 'tinte' | 'rot' | 'blau' | 'gruen', p: [x, y, x, y, …] }]
// Koordinaten sind ganze Zahlen in einer Malfläche von 400 × 300.
import { registerCrud } from '../resource.js';
import { HttpError } from '../http.js';

export const PAPERS = ['gelb', 'rosa', 'mint', 'blau'];
export const INKS = ['tinte', 'rot', 'blau', 'gruen'];
export const PAD = { w: 400, h: 300 };
export const LIFETIME_MS = 24 * 60 * 60 * 1000;
const MAX_STROKES = 300;
const MAX_POINTS = 8000; // Zahlen insgesamt (x und y)

/** Gemalte Striche prüfen (nur Zahlen in der Malfläche, bekannte Farben). */
function checkDrawing(value, key) {
  if (!Array.isArray(value)) throw new HttpError(400, `${key}: Liste erwartet`);
  if (value.length > MAX_STROKES) throw new HttpError(400, `${key}: zu viele Striche`);
  let total = 0;
  const out = value.map((s, i) => {
    if (!s || typeof s !== 'object' || !Array.isArray(s.p)) throw new HttpError(400, `${key}: Strich ${i + 1} ungültig`);
    if (!INKS.includes(s.c)) throw new HttpError(400, `${key}: unbekannte Farbe`);
    if (s.p.length < 2 || s.p.length % 2) throw new HttpError(400, `${key}: Strich ${i + 1} ungültig`);
    total += s.p.length;
    const p = s.p.map((n, j) => {
      const max = j % 2 ? PAD.h : PAD.w;
      if (!Number.isInteger(n) || n < 0 || n > max) throw new HttpError(400, `${key}: Punkt außerhalb der Malfläche`);
      return n;
    });
    return { c: s.c, p };
  });
  if (total > MAX_POINTS) throw new HttpError(400, `${key}: zu groß – bitte etwas weniger malen`);
  return out.length ? out : null;
}

export default {
  name: 'messages',
  inState: true,
  register(ctx) {
    const { db } = ctx;
    const api = registerCrud(ctx, {
      path: '/api/messages',
      table: 'door_messages',
      orderBy: 'id',
      fields: {
        body:       { col: 'body',        type: 'text', max: 300, multiline: true },
        drawing:    { col: 'drawing',     type: 'json', max: 48000, check: checkDrawing },
        paper:      { col: 'paper',       type: 'text', values: PAPERS, default: 'gelb' },
        toPerson:   { col: 'to_person',   type: 'int',  ref: 'people' },
        fromPerson: { col: 'from_person', type: 'int',  readonly: true },
      },
      hooks: {
        beforeWrite(values, existing, { actor }) {
          if (existing) throw new HttpError(405, 'Nachrichten kann man nicht ändern – lieber abnehmen und neu schreiben');
          if (!actor) throw new HttpError(400, 'Bitte erst unter „Mehr“ auswählen, wer du bist');
          if (!values.body && !values.drawing) throw new HttpError(400, 'Die Nachricht ist noch leer');
          values.from_person = actor;
          // Empfänger: immer die andere Person (bei mehr als zwei: wer angegeben ist)
          if (values.to_person == null) {
            values.to_person = db.prepare('SELECT id FROM people WHERE id != ? ORDER BY sort, id LIMIT 1').get(actor)?.id ?? null;
          }
          if (values.to_person === actor) throw new HttpError(400, 'Die Nachricht ist für die andere Person');
          if (values.to_person == null) throw new HttpError(400, 'Es gibt noch niemanden, an den die Nachricht gehen kann');
        },
      },
    });

    // Alte Nachrichten (älter als 24 Std.) wegräumen. Kein bumpRev nötig: die Geräte
    // blenden abgelaufene Nachrichten ohnehin selbst aus.
    const prune = db.prepare('DELETE FROM door_messages WHERE created_at < ?');
    const list = () => {
      prune.run(new Date(Date.now() - LIFETIME_MS).toISOString());
      return api.list();
    };
    return { ...api, list };
  },
};
