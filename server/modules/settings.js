// Modul: gemeinsame Einstellungen (gelten für alle Geräte im Haushalt).
//
//   GET   /api/settings            alle Einstellungen (kommt auch in /api/state mit)
//   PATCH /api/settings            einzelne ändern, z. B. { "fridgeColor": "mint" }
//
// NEUE EINSTELLUNG? Unten in SETTINGS eintragen (erlaubte Werte + Standard),
// dann in public/js/views/einstellungen.js anzeigen. Keine Migration nötig.
import { HttpError, readJson } from '../http.js';
import { bumpRev, now, transaction } from '../db.js';
import { config } from '../config.js';

export const SETTINGS = {
  // Farbe der Kühlschranktür (Farben stehen in public/css/tokens.css)
  fridgeColor: { values: ['mauve', 'rose', 'mint', 'salbei', 'himmel', 'creme'], default: 'mauve' },
  // Nach jedem wievielten Zettel ein Foto hängt (0 = keine Fotos im Vorrat)
  photoEvery: { values: [0, 1, 2, 3], default: 2 },
};

export default {
  name: 'settings',
  inState: true,
  register({ db, router }) {
    const read = () => {
      const out = {};
      for (const [key, def] of Object.entries(SETTINGS)) out[key] = def.default;
      for (const row of db.prepare('SELECT key, value FROM settings').all()) {
        if (!(row.key in SETTINGS)) continue;
        try {
          const v = JSON.parse(row.value);
          if (SETTINGS[row.key].values.includes(v)) out[row.key] = v;
        } catch { /* kaputter Wert -> Standard */ }
      }
      return out;
    };

    router.get('/api/settings', () => read());

    router.patch('/api/settings', async ({ req }) => {
      const body = await readJson(req, config.maxBodyBytes);
      const entries = Object.entries(body);
      for (const [key, value] of entries) {
        const def = SETTINGS[key];
        if (!def) throw new HttpError(400, `Unbekannte Einstellung: ${key}`);
        if (!def.values.includes(value)) throw new HttpError(400, `${key}: ungültiger Wert`);
      }
      if (entries.length) {
        transaction(db, () => {
          const upsert = db.prepare(
            'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ' +
            'ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'
          );
          for (const [key, value] of entries) upsert.run(key, JSON.stringify(value), now());
          bumpRev(db);
        });
      }
      return read();
    });

    return { list: read, get: read };
  },
};
