// Modul: Kalender – zeigt eure Apple-Kalender in der App (nur lesen), zusammen als EIN Kalender.
//
// So funktioniert's: Jede Person teilt in der Kalender-App ihren Kalender als "Öffentlichen
// Kalender". Apple gibt dafür einen geheimen Link (webcal://…). Den fügt ihr EINMAL in der App ein
// (Planer -> Kalender oder Mehr -> Kalender), je Person einer. Der Server holt alle 15 Minuten neu.
// Steht derselbe Termin (gleicher Titel, gleiche Zeit) in beiden Kalendern, kommt er nur einmal.
//
//   PUT  /api/calendar/:personId   { url } Link speichern (wird sofort ausprobiert) – { url: null } trennt
//   POST /api/calendar/sync        jetzt alle neu holen
//   (Termine kommen in /api/state als "calendar" mit – die Links selbst NIE, sie bleiben auf dem Server)
import { HttpError, readJson } from '../http.js';
import { bumpRev, now } from '../db.js';
import { config } from '../config.js';
import { fetchPublicText } from '../recipe-import.js';
import { expandIcs } from '../ical.js';

const SYNC_EVERY_MS = 15 * 60 * 1000;
const DAYS_BACK = 400;    // so weit zurück werden Termine gezeigt
const DAYS_AHEAD = 760;   // so weit voraus
const ZONE = process.env.KALENDER_ZEITZONE || 'Europe/Berlin';

/** webcal://… (so liefert Apple den Link) -> https://… */
function normalizeUrl(raw) {
  let url;
  try { url = new URL(String(raw || '').trim().replace(/^webcals?:\/\//i, 'https://')); } catch {
    throw new HttpError(400, 'Das sieht nicht wie ein Kalender-Link aus');
  }
  if (!['https:', 'http:'].includes(url.protocol)) throw new HttpError(400, 'Das sieht nicht wie ein Kalender-Link aus');
  return url;
}

const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
const sameKey = (e) => `${e.title.trim().toLocaleLowerCase('de')}|${e.start}|${e.end}|${e.allDay}`;

export default {
  name: 'calendar',
  inState: true,
  register({ db, router }) {
    const feeds = () => db.prepare('SELECT * FROM calendar_feeds ORDER BY person_id').all();
    const feedOf = (personId) => db.prepare('SELECT * FROM calendar_feeds WHERE person_id = ?').get(personId);
    const update = (personId, fields) => {
      const cols = Object.keys(fields);
      db.prepare(`UPDATE calendar_feeds SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = ? WHERE person_id = ?`)
        .run(...cols.map((c) => fields[c]), now(), personId);
      bumpRev(db);
    };

    // Zusammengeführte Termine zwischenspeichern (nur neu rechnen, wenn sich etwas geändert hat)
    let cache = { key: null, value: null };
    const list = () => {
      const rows = feeds();
      const key = rows.map((r) => `${r.person_id}:${r.updated_at}`).join(',') + `|${isoDay(Date.now())}`;
      if (cache.key === key) return cache.value;
      const from = isoDay(Date.now() - DAYS_BACK * 86400000);
      const to = isoDay(Date.now() + DAYS_AHEAD * 86400000);
      const merged = new Map();
      for (const r of rows) {
        let events = [];
        try { if (r.ics) events = expandIcs(r.ics, { from, to, zone: ZONE }).events; } catch { /* Fehler steht in error */ }
        for (const e of events) {
          const k = sameKey(e);
          const hit = merged.get(k);
          if (hit) { if (!hit.people.includes(r.person_id)) hit.people.push(r.person_id); continue; }
          merged.set(k, { ...e, id: `${r.person_id}-${e.id}`, people: [Number(r.person_id)] });
        }
      }
      const events = [...merged.values()].sort((a, b) => a.start.localeCompare(b.start) || (b.allDay - a.allDay) || a.title.localeCompare(b.title));
      cache = {
        key,
        value: {
          connected: rows.length > 0,
          feeds: rows.map((r) => ({ personId: Number(r.person_id), name: r.name, syncedAt: r.synced_at, error: r.error })),
          events,
        },
      };
      return cache.value;
    };

    /** Kalender holen und prüfen. Wirft bei Fehler (mit verständlicher Meldung). */
    async function download(url) {
      const text = await fetchPublicText(url, { accept: 'text/calendar,*/*;q=0.5', agent: 'MovingCastle-Kalender/1.0' });
      let parsed;
      try { parsed = expandIcs(text, { from: isoDay(Date.now()), to: isoDay(Date.now() + 86400000), zone: ZONE }); } catch {
        throw new HttpError(422, 'Unter dem Link liegt kein Kalender – bitte den Link aus „Öffentlicher Kalender“ nehmen');
      }
      return { text, name: parsed.name };
    }

    async function syncOne(r) {
      try {
        const { text, name } = await download(new URL(r.url));
        if (text !== r.ics || name !== r.name || r.error) update(r.person_id, { ics: text, name: name || r.name, synced_at: now(), error: null });
        else update(r.person_id, { synced_at: now() });
      } catch (err) {
        const msg = err instanceof HttpError ? err.message : 'Kalender konnte nicht geholt werden';
        if (msg !== r.error) update(r.person_id, { error: msg });
        console.warn(`[kalender] Person ${r.person_id}: ${msg}`);
      }
    }

    let running = null;
    function sync() {
      if (!running) running = Promise.all(feeds().map(syncOne)).finally(() => { running = null; });
      return running;
    }

    router.put('/api/calendar/:personId', async ({ req, params }) => {
      const personId = Number(params.personId);
      if (!Number.isSafeInteger(personId) || !db.prepare('SELECT 1 FROM people WHERE id = ?').get(personId)) {
        throw new HttpError(404, 'Diese Person gibt es nicht');
      }
      const body = await readJson(req, config.maxBodyBytes);
      if (body.url === null || body.url === '') {
        db.prepare('DELETE FROM calendar_feeds WHERE person_id = ?').run(personId);
        bumpRev(db);
        return list();
      }
      const url = normalizeUrl(body.url);
      const { text, name } = await download(url);   // erst ausprobieren, dann speichern
      const ts = now();
      db.prepare(
        `INSERT INTO calendar_feeds (person_id, url, name, ics, synced_at, error, updated_at) VALUES (?, ?, ?, ?, ?, NULL, ?)
         ON CONFLICT(person_id) DO UPDATE SET url = excluded.url, name = excluded.name, ics = excluded.ics,
           synced_at = excluded.synced_at, error = NULL, updated_at = excluded.updated_at`
      ).run(personId, url.href, name, text, ts, ts);
      bumpRev(db);
      return list();
    });

    router.post('/api/calendar/sync', async () => {
      if (!feeds().length) throw new HttpError(409, 'Es ist noch kein Kalender verbunden');
      await sync();
      return list();
    });

    // regelmäßig neu holen (unref: hält den Server beim Beenden nicht auf)
    setTimeout(sync, 5000).unref();
    setInterval(sync, SYNC_EVERY_MS).unref();

    return { list, get: list };
  },
};
