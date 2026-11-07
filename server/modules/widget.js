// Modul: iPhone-Widget (über die kostenlose App „Scriptable“, Skript: public/widget/moving-castle-widget.js).
//
//   GET    /api/widget              Gibt es schon einen Schlüssel für mich? + was soll das Widget zeigen
//   POST   /api/widget/schluessel   Neuen geheimen Schlüssel erzeugen (der alte gilt dann nicht mehr)
//   DELETE /api/widget/schluessel   Schlüssel löschen (Widget zeigt dann nichts mehr)
//   PUT    /api/widget              Auswahl speichern: { show: ["liste", "aufgaben", …] }
//   GET    /api/widget/daten        Für das Widget selbst – ohne Anmeldung, aber nur mit Schlüssel
//                                   (Header „X-Widget-Key“).
//
// In der Datenbank liegt nur ein Hash des Schlüssels.
import crypto from 'node:crypto';
import { HttpError, readJson } from '../http.js';
import { actorOf } from '../resource.js';
import { config } from '../config.js';
import { now } from '../db.js';
import { summaryFor } from '../summary.js';

export const SECTIONS = ['liste', 'aufgaben', 'essen', 'tuer', 'termine'];
const DEFAULT_SHOW = ['liste', 'aufgaben', 'essen', 'tuer'];
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

function checkShow(value) {
  if (!Array.isArray(value) || value.some((v) => !SECTIONS.includes(v))) throw new HttpError(400, 'show: unbekannter Bereich');
  return [...new Set(value)];
}

export default {
  name: 'widget',
  register(ctx) {
    const { db, router } = ctx;
    const me = (req) => {
      const person = actorOf(db, req);
      if (!person) throw new HttpError(400, 'Bitte erst unter „Mehr“ auswählen, wer du bist');
      return person;
    };
    const rowOf = (person) => db.prepare('SELECT * FROM widget_tokens WHERE person_id = ?').get(person);
    const showOf = (row) => { try { return checkShow(JSON.parse(row?.prefs || 'null')?.show ?? DEFAULT_SHOW); } catch { return DEFAULT_SHOW; } };

    router.get('/api/widget', ({ req }) => {
      const row = rowOf(me(req));
      return { hasKey: Boolean(row), usedAt: row?.used_at || null, show: showOf(row), sections: SECTIONS };
    });

    router.post('/api/widget/schluessel', ({ req }) => {
      const person = me(req);
      const key = crypto.randomBytes(24).toString('base64url');
      const old = rowOf(person);
      db.prepare(`INSERT INTO widget_tokens (person_id, token_hash, prefs, created_at) VALUES (?, ?, ?, ?)
        ON CONFLICT(person_id) DO UPDATE SET token_hash = excluded.token_hash, created_at = excluded.created_at, used_at = NULL`)
        .run(person, sha256(key), old?.prefs ?? null, now());
      return { key };
    });

    router.delete('/api/widget/schluessel', ({ req }) => {
      db.prepare('DELETE FROM widget_tokens WHERE person_id = ?').run(me(req));
      return { ok: true };
    });

    router.put('/api/widget', async ({ req }) => {
      const person = me(req);
      const show = checkShow((await readJson(req, config.maxBodyBytes)).show);
      const row = rowOf(person);
      if (row) db.prepare('UPDATE widget_tokens SET prefs = ? WHERE person_id = ?').run(JSON.stringify({ show }), person);
      else throw new HttpError(409, 'Erst das Widget einrichten');
      return { show };
    });

    router.get('/api/widget/daten', ({ req }) => {
      const key = String(req.headers['x-widget-key'] || '');
      const row = /^[A-Za-z0-9_-]{32}$/.test(key) ? db.prepare('SELECT * FROM widget_tokens WHERE token_hash = ?').get(sha256(key)) : null;
      if (!row) throw new HttpError(401, 'Widget-Schlüssel ungültig – bitte in der App unter „Mehr → Widget“ neu einrichten');
      // höchstens alle 10 Minuten „zuletzt benutzt“ speichern
      if (!row.used_at || Date.now() - Date.parse(row.used_at) > 600000) {
        db.prepare('UPDATE widget_tokens SET used_at = ? WHERE person_id = ?').run(now(), row.person_id);
      }
      const s = summaryFor(ctx, Number(row.person_id));
      const fridgeColor = ctx.resources.prefs?.api.of(Number(row.person_id)).fridgeColor || 'mauve'; // Türfarbe der Person
      // Alles mitschicken: was gezeigt wird, entscheidet „show“ (bzw. der Parameter am Widget)
      return {
        person: s.person,
        day: s.day,
        fridgeColor,
        show: showOf(row),
        liste: s.list,
        aufgaben: s.tasks,
        essen: s.meal,
        tuer: s.message,
        termine: s.events,
      };
    });

    return { list: () => [], get: () => null };
  },
};

