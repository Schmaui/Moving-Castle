// Modul: Einstellungen pro Person – folgen der Person auf jedes Gerät
// (nach „Wer bist du?“ ist auf einem neuen Handy alles wieder da).
//
//   GET   /api/prefs              { "1": {…}, "2": {…} } (kommt auch in /api/state mit, als „prefs“)
//   PATCH /api/prefs/:personId    einzelne Werte ändern, z. B. { "fridgeColor": "himmel" }
//
//   fridgeColor   – Farbe der Kühlschranktür (wie bisher in settings, jetzt pro Person)
//   photoEvery    – Fotos an der Tür: 0 = aus, sonst an
//   openNotes     – aufgeklappte Zettel in Küche/Haushalt (Kategorie-IDs); null = noch nie gespeichert
//   seenMessages  – schon angeschaute Nachrichten an der Tür (IDs, die letzten 100)
//   push          – Benachrichtigungen: was kommt, Ruhezeit, Uhrzeit morgens (siehe push.js)
//
// Was eine Person noch nicht eingestellt hat, kommt aus den bisherigen gemeinsamen Einstellungen.
import { HttpError, readJson } from '../http.js';
import { bumpRev, now, transaction } from '../db.js';
import { config } from '../config.js';
import { SETTINGS } from './settings.js';
import { checkPrefs as checkPush } from './push.js';

const ids = (max) => (value, key) => {
  if (value === null) return null;
  if (!Array.isArray(value) || !value.every((v) => Number.isSafeInteger(v) && v > 0)) throw new HttpError(400, `${key}: Liste von IDs erwartet`);
  return [...new Set(value)].slice(-max);
};
const oneOf = (key) => (value) => {
  if (!SETTINGS[key].values.includes(value)) throw new HttpError(400, `${key}: ungültiger Wert`);
  return value;
};

export const PREFS = {
  fridgeColor: oneOf('fridgeColor'),
  photoEvery: oneOf('photoEvery'),
  openNotes: ids(500),
  seenMessages: ids(100),
  push: (value) => checkPush(value),
};

export default {
  name: 'prefs',
  inState: true,
  register({ db, router }) {
    const shared = () => {
      const out = {};
      for (const [key, def] of Object.entries(SETTINGS)) out[key] = def.default;
      for (const row of db.prepare('SELECT key, value FROM settings').all()) {
        try { if (SETTINGS[row.key]?.values.includes(JSON.parse(row.value))) out[row.key] = JSON.parse(row.value); } catch { /* Startwert */ }
      }
      return out;
    };
    const stored = (personId) => {
      try { return JSON.parse(db.prepare('SELECT data FROM person_prefs WHERE person_id = ?').get(personId)?.data || '{}'); } catch { return {}; }
    };
    // Benachrichtigungen: bisher pro Handy gespeichert -> das zuletzt geänderte Handy der Person übernehmen
    const oldPush = (personId) => {
      const row = db.prepare('SELECT prefs FROM push_subscriptions WHERE person_id = ? ORDER BY updated_at DESC LIMIT 1').get(personId);
      try { return row?.prefs ? JSON.parse(row.prefs) : {}; } catch { return {}; }
    };

    /** Fertige Einstellungen einer Person (mit Startwerten aufgefüllt). */
    const of = (personId, base = shared()) => {
      const p = stored(personId);
      return {
        fridgeColor: p.fridgeColor ?? base.fridgeColor,
        photoEvery: p.photoEvery ?? base.photoEvery,
        openNotes: p.openNotes ?? null,
        seenMessages: p.seenMessages ?? [],
        push: checkPush(p.push ?? oldPush(personId)),
      };
    };
    const list = () => {
      const base = shared();
      const out = {};
      for (const { id } of db.prepare('SELECT id FROM people ORDER BY id').all()) out[id] = of(Number(id), base);
      return out;
    };

    router.get('/api/prefs', () => list());

    router.patch('/api/prefs/:personId', async ({ req, params }) => {
      const personId = Number(params.personId);
      if (!Number.isSafeInteger(personId) || !db.prepare('SELECT 1 FROM people WHERE id = ?').get(personId)) {
        throw new HttpError(404, 'Person nicht gefunden');
      }
      const body = await readJson(req, config.maxBodyBytes);
      if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new HttpError(400, 'Objekt erwartet');
      const next = stored(personId);
      for (const [key, value] of Object.entries(body)) {
        if (!PREFS[key]) throw new HttpError(400, `Unbekannte Einstellung: ${key}`);
        next[key] = PREFS[key](value, key);
      }
      transaction(db, () => {
        db.prepare(`INSERT INTO person_prefs (person_id, data, updated_at) VALUES (?, ?, ?)
          ON CONFLICT(person_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`)
          .run(personId, JSON.stringify(next), now());
        bumpRev(db);
      });
      return of(personId);
    });

    return { list, get: list, of };
  },
};
