// Modul: Filmabend – Merkliste für Filme und Serien (Pinnwand -> Filmabend).
//
//   GET    /api/movies          Liste (kommt auch in /api/state mit)
//   POST   /api/movies          Neu auf die Merkliste
//   PATCH  /api/movies/:id      Ändern (z. B. gesehen + Bewertung)
//   DELETE /api/movies/:id      Löschen (mit "Rückgängig" in der App)
//
//   wantedBy – [personId, …]: wer will's sehen?
//   ratings  – { personId: 1..5 }: Popcorn-Bewertung nach dem Gucken
//   seenOn   – leer = Merkliste, sonst Datum = "Gesehen"
import { registerCrud } from '../resource.js';
import { HttpError } from '../http.js';

export const KINDS = ['film', 'serie'];
export const SERVICES = ['netflix', 'prime', 'disney', 'hbo', 'kino', 'sonstiges'];
const MAX_PEOPLE = 10;

const isId = (v) => Number.isSafeInteger(v) && v > 0;

/** wantedBy: Liste von Personen-IDs (doppelte fallen weg). */
function checkWanted(value, key) {
  if (!Array.isArray(value)) throw new HttpError(400, `${key}: Liste erwartet`);
  if (value.length > MAX_PEOPLE) throw new HttpError(400, `${key}: zu viele Einträge`);
  if (!value.every(isId)) throw new HttpError(400, `${key}: Personen-IDs erwartet`);
  return [...new Set(value)];
}

/** ratings: { personId: 1..5 }. */
function checkRatings(value, key) {
  if (typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400, `${key}: Objekt erwartet`);
  const entries = Object.entries(value);
  if (entries.length > MAX_PEOPLE) throw new HttpError(400, `${key}: zu viele Einträge`);
  const out = {};
  for (const [person, stars] of entries) {
    if (!/^[1-9]\d{0,8}$/.test(person)) throw new HttpError(400, `${key}: ungültige Person`);
    if (!Number.isSafeInteger(stars) || stars < 1 || stars > 5) throw new HttpError(400, `${key}: 1 bis 5 Popcorn`);
    out[person] = stars;
  }
  return out;
}

export default {
  name: 'movies',
  inState: true,
  register(ctx) {
    return registerCrud(ctx, {
      path: '/api/movies',
      table: 'movies',
      orderBy: 'id',
      fields: {
        title:    { col: 'title',     type: 'text', required: true, max: 120 },
        kind:     { col: 'kind',      type: 'text', values: KINDS, default: 'film' },
        service:  { col: 'service',   type: 'text', values: SERVICES },
        note:     { col: 'note',      type: 'text', max: 300 },
        wantedBy: { col: 'wanted_by', type: 'json', max: 400, check: checkWanted },
        ratings:  { col: 'ratings',   type: 'json', max: 400, check: checkRatings },
        seenOn:   { col: 'seen_on',   type: 'date' },
        addedBy:  { col: 'added_by',  type: 'int',  readonly: true },
      },
      hooks: {
        beforeWrite(values, existing, { actor }) {
          if ('kind' in values && values.kind == null) throw new HttpError(400, 'kind: Pflichtfeld');
          if (!existing) values.added_by = actor;
        },
      },
    });
  },
};
