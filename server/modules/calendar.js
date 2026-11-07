// Modul: Kalender – zeigt euren gemeinsamen Apple-Kalender in der App (nur lesen).
//
// So funktioniert's: In der Kalender-App wird der gemeinsame Kalender als "Öffentlicher
// Kalender" geteilt. Apple gibt dafür einen geheimen Link (webcal://…). Den fügt ihr EINMAL in
// der App ein (Mehr -> Kalender). Der Server holt die Termine dann alle 15 Minuten neu.
//
//   PUT  /api/calendar        { url } Link speichern (wird sofort ausprobiert) – { url: null } trennt
//   POST /api/calendar/sync   jetzt neu holen
//   (Termine kommen in /api/state als "calendar" mit – der Link selbst NIE, er bleibt auf dem Server)
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

export default {
  name: 'calendar',
  inState: true,
  register({ db, router }) {
    const row = () => db.prepare('SELECT * FROM calendar_feed WHERE id = 1').get() || null;
    const save = (fields) => {
      const cols = Object.keys(fields);
      db.prepare(
        `INSERT INTO calendar_feed (id, ${cols.join(', ')}, updated_at) VALUES (1, ${cols.map(() => '?').join(', ')}, ?)
         ON CONFLICT(id) DO UPDATE SET ${cols.map((c) => `${c} = excluded.${c}`).join(', ')}, updated_at = excluded.updated_at`
      ).run(...cols.map((c) => fields[c]), now());
      bumpRev(db);
    };

    // Aufgefaltete Termine zwischenspeichern (nur neu rechnen, wenn sich etwas geändert hat)
    let cache = { key: null, value: null };
    const list = () => {
      const r = row();
      if (!r?.url) return { connected: false, events: [] };
      const today = Date.now();
      const key = `${r.updated_at}|${isoDay(today)}`;
      if (cache.key !== key) {
        let events = [];
        try {
          if (r.ics) events = expandIcs(r.ics, { from: isoDay(today - DAYS_BACK * 86400000), to: isoDay(today + DAYS_AHEAD * 86400000), zone: ZONE }).events;
        } catch { /* kaputte Datei -> keine Termine, Fehler steht in error */ }
        cache = { key, value: { connected: true, name: r.name, syncedAt: r.synced_at, error: r.error, events } };
      }
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

    let running = null;
    async function sync() {
      const r = row();
      if (!r?.url) return;
      if (running) return running;
      running = (async () => {
        try {
          const { text, name } = await download(new URL(r.url));
          if (text !== r.ics || name !== r.name || r.error) save({ ics: text, name: name || r.name, synced_at: now(), error: null });
          else save({ synced_at: now() });
        } catch (err) {
          const msg = err instanceof HttpError ? err.message : 'Kalender konnte nicht geholt werden';
          if (msg !== r.error) save({ error: msg });
          console.warn(`[kalender] ${msg}`);
        } finally {
          running = null;
        }
      })();
      return running;
    }

    router.put('/api/calendar', async ({ req }) => {
      const body = await readJson(req, config.maxBodyBytes);
      if (body.url === null || body.url === '') {
        db.prepare('DELETE FROM calendar_feed').run();
        bumpRev(db);
        return list();
      }
      const url = normalizeUrl(body.url);
      const { text, name } = await download(url);   // erst ausprobieren, dann speichern
      save({ url: url.href, ics: text, name, synced_at: now(), error: null });
      return list();
    });

    router.post('/api/calendar/sync', async () => {
      if (!row()?.url) throw new HttpError(409, 'Es ist noch kein Kalender verbunden');
      await sync();
      return list();
    });

    // regelmäßig neu holen (unref: hält den Server beim Beenden nicht auf)
    setTimeout(sync, 5000).unref();
    setInterval(sync, SYNC_EVERY_MS).unref();

    return { list, get: list };
  },
};
