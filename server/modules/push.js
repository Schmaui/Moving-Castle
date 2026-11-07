// Modul: Benachrichtigungen aufs iPhone (Web-Push).
//
//   GET  /api/push/key           Öffentlicher Schlüssel (braucht das Handy zum Anmelden)
//   POST /api/push/abo           Handy anmelden bzw. Einstellungen ändern: { endpoint, keys, prefs }
//   POST /api/push/abo/aus       Handy abmelden: { endpoint }
//   POST /api/push/test          Test-Benachrichtigung an dieses Handy: { endpoint }
//
// Wann kommt etwas? (jedes Handy stellt selbst ein, was es will – prefs.kinds)
//   tuer      – der/die andere hängt eine Nachricht an die Tür
//   liste     – der/die andere setzt etwas auf die Einkaufsliste (gesammelt: erst wenn ein paar
//               Minuten nichts mehr dazukommt -> „Kait hat 3 Sachen auf die Liste gesetzt: …“)
//   aufgaben  – morgens: was heute dran ist      } eine gemeinsame Morgen-Nachricht
//   termine   – morgens: Termine aus dem Kalender } zur eingestellten Uhrzeit (prefs.morning)
// Ruhezeit (prefs.quiet): was in der Zeit passiert, wartet bis zum Ende der Ruhezeit.
//
// Alles läuft über eine Warteschlange (push_queue), die alle paar Sekunden abgearbeitet wird.
import { HttpError, readJson } from '../http.js';
import { actorOf } from '../resource.js';
import { config } from '../config.js';
import { now } from '../db.js';
import { loadVapidKeys, sendPush, isPushEndpoint } from '../webpush.js';
import { localNow, summaryFor } from '../summary.js';

export const KINDS = ['tuer', 'liste', 'aufgaben', 'termine'];
export const DEFAULT_PREFS = {
  kinds: { tuer: true, liste: true, aufgaben: true, termine: true },
  quiet: { on: true, from: '22:00', to: '07:00' },
  morning: '07:30',
};
const TICK_MS = Number(process.env.PUSH_TICK_MS) || 20000;
const LIST_DELAY_MS = process.env.PUSH_LIST_DELAY_MS != null ? Number(process.env.PUSH_LIST_DELAY_MS) : 3 * 60 * 1000;
const ALLOW_LOCAL = process.env.PUSH_ALLOW_LOCAL === '1'; // nur für Tests
const MAX_ATTEMPTS = 6;
const MAX_SUBSCRIPTIONS = 20;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Einstellungen prüfen und mit den Startwerten auffüllen. */
export function checkPrefs(raw = {}) {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new HttpError(400, 'prefs: Objekt erwartet');
  const kinds = {};
  for (const k of KINDS) kinds[k] = raw.kinds?.[k] != null ? raw.kinds[k] === true : DEFAULT_PREFS.kinds[k];
  const time = (v, fallback, key) => {
    if (v == null) return fallback;
    if (typeof v !== 'string' || !TIME.test(v)) throw new HttpError(400, `${key}: Uhrzeit wie 07:30 erwartet`);
    return v;
  };
  return {
    kinds,
    quiet: {
      on: raw.quiet?.on != null ? raw.quiet.on === true : DEFAULT_PREFS.quiet.on,
      from: time(raw.quiet?.from, DEFAULT_PREFS.quiet.from, 'Ruhezeit von'),
      to: time(raw.quiet?.to, DEFAULT_PREFS.quiet.to, 'Ruhezeit bis'),
    },
    morning: time(raw.morning, DEFAULT_PREFS.morning, 'Morgens um'),
  };
}

/** Liegt die Uhrzeit (HH:MM) in der Ruhezeit? (auch über Mitternacht, z. B. 22:00–07:00) */
export function inQuiet(prefs, time) {
  const q = prefs.quiet;
  if (!q?.on || q.from === q.to) return false;
  return q.from < q.to ? time >= q.from && time < q.to : time >= q.from || time < q.to;
}

/** "07:30" + 4 Std. -> "11:30" (höchstens "23:59") */
const addHours = (time, h) => {
  const m = Math.min(23 * 60 + 59, Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) + h * 60);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

const listText = (names) => {
  const shown = names.slice(0, 6).join(', ');
  return names.length > 6 ? `${shown} und ${names.length - 6} mehr` : shown;
};

export default {
  name: 'push',
  register(ctx) {
    const { db, router, events } = ctx;
    const keys = loadVapidKeys(db);
    // „Absender“ für Apple & Co.: die Adresse der App (merkt sich der Server beim ersten Anmelden eines Handys)
    const meta = (k) => db.prepare('SELECT value FROM meta WHERE key = ?').get(k)?.value;
    const setMeta = (k, v) => db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, v);

    const subsOf = (personId) => db.prepare('SELECT * FROM push_subscriptions WHERE person_id = ?').all(personId);
    const prefsOf = (sub) => { try { return checkPrefs(JSON.parse(sub.prefs || '{}')); } catch { return checkPrefs({}); } };
    const enqueue = (sub, msg, dueMs = Date.now()) => db.prepare(
      'INSERT INTO push_queue (subscription_id, kind, group_key, title, body, url, data, due_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(sub.id, msg.kind, msg.group ?? null, msg.title, msg.body ?? null, msg.url ?? null,
      msg.data ? JSON.stringify(msg.data) : null, new Date(dueMs).toISOString(), now());

    // ---------- Was passiert gerade? (kommt von resource.js) ----------
    const others = (actor) => db.prepare('SELECT id, name FROM people WHERE id != ?').all(actor ?? -1);
    const nameOf = (id) => db.prepare('SELECT name FROM people WHERE id = ?').get(id)?.name || 'Jemand';

    /** Etwas kam auf die Liste: für die anderen sammeln (pro Absender eine Nachricht). */
    function listAdded(actor, name) {
      if (!actor) return;
      for (const person of others(actor)) {
        for (const sub of subsOf(person.id)) {
          if (!prefsOf(sub).kinds.liste) continue;
          const group = `liste:${actor}`;
          const due = new Date(Date.now() + LIST_DELAY_MS).toISOString();
          const open = db.prepare('SELECT * FROM push_queue WHERE subscription_id = ? AND group_key = ?').get(sub.id, group);
          const names = open ? [...JSON.parse(open.data || '[]').filter((n) => n !== name), name] : [name];
          const who = nameOf(actor);
          const title = names.length === 1 ? `${who} hat ${name} auf die Liste gesetzt` : `${who} hat ${names.length} Sachen auf die Liste gesetzt`;
          const body = names.length === 1 ? 'Einkaufsliste ansehen' : listText(names);
          if (open) {
            db.prepare('UPDATE push_queue SET title = ?, body = ?, data = ?, due_at = ? WHERE id = ?').run(title, body, JSON.stringify(names), due, open.id);
          } else {
            enqueue(sub, { kind: 'liste', group, title, body, url: '/#/liste', data: names }, Date.parse(due));
          }
        }
      }
    }

    /** Doch wieder da (z. B. „Rückgängig“), bevor die Nachricht raus ist -> aus der Sammlung nehmen. */
    function listRemoved(name) {
      for (const open of db.prepare("SELECT * FROM push_queue WHERE kind = 'liste'").all()) {
        const names = JSON.parse(open.data || '[]');
        if (!names.includes(name)) continue;
        const rest = names.filter((n) => n !== name);
        if (!rest.length) { db.prepare('DELETE FROM push_queue WHERE id = ?').run(open.id); continue; }
        const who = open.title.split(' hat ')[0];
        const title = rest.length === 1 ? `${who} hat ${rest[0]} auf die Liste gesetzt` : `${who} hat ${rest.length} Sachen auf die Liste gesetzt`;
        db.prepare('UPDATE push_queue SET title = ?, body = ?, data = ? WHERE id = ?')
          .run(title, rest.length === 1 ? 'Einkaufsliste ansehen' : listText(rest), JSON.stringify(rest), open.id);
      }
    }

    function messageAdded(msg) {
      for (const sub of subsOf(msg.toPerson)) {
        if (!prefsOf(sub).kinds.tuer) continue;
        const text = msg.body ? (msg.body.length > 120 ? msg.body.slice(0, 117) + '…' : msg.body) : 'Hat dir etwas gemalt ✎';
        enqueue(sub, { kind: 'tuer', title: `${nameOf(msg.fromPerson)} hat dir eine Nachricht an die Tür gehängt ♡`, body: text, url: '/#/vorrat' });
      }
    }

    events.on('write', ({ table, before, after, actor }) => {
      try {
        if (table === 'items') {
          if (after?.missing && !before?.missing) listAdded(actor, after.name);
          if (before?.missing && !after?.missing) listRemoved(before.name);
        } else if (table === 'wishes') {
          if (after && !before) listAdded(actor, after.name);
          if (before && !after) listRemoved(before.name);
        } else if (table === 'door_messages' && after && !before) {
          messageAdded(after);
        }
      } catch (err) {
        console.error('[push] Fehler beim Vormerken:', err.message);
      }
    });

    // ---------- Morgens: Aufgaben + Termine ----------
    function morning(nowLocal) {
      for (const sub of db.prepare('SELECT * FROM push_subscriptions WHERE person_id IS NOT NULL').all()) {
        const prefs = prefsOf(sub);
        if (!prefs.kinds.aufgaben && !prefs.kinds.termine) continue;
        if (sub.last_morning === nowLocal.day) continue;
        // nur in den 4 Stunden nach der eingestellten Uhrzeit (falls der Server mal aus war: nicht abends nachholen)
        if (nowLocal.time < prefs.morning || nowLocal.time >= addHours(prefs.morning, 4)) continue;
        db.prepare('UPDATE push_subscriptions SET last_morning = ? WHERE id = ?').run(nowLocal.day, sub.id);
        const s = summaryFor(ctx, Number(sub.person_id));
        const lines = [];
        if (prefs.kinds.termine) for (const e of s.events.slice(0, 4)) lines.push(`${e.time ? e.time + ' ' : ''}${e.title}`);
        if (prefs.kinds.aufgaben) for (const t of s.tasks.slice(0, 5)) lines.push(`☐ ${t.title}${t.overdue ? ' (überfällig)' : ''}`);
        if (!lines.length) continue; // nichts los -> nichts schicken
        const parts = [
          prefs.kinds.termine && s.events.length && `${s.events.length} ${s.events.length === 1 ? 'Termin' : 'Termine'}`,
          prefs.kinds.aufgaben && s.tasks.length && `${s.tasks.length} ${s.tasks.length === 1 ? 'Aufgabe' : 'Aufgaben'}`,
        ].filter(Boolean);
        enqueue(sub, {
          kind: 'morgen', title: `Guten Morgen ${s.person || ''} ♡ Heute: ${parts.join(', ')}`.replace('  ', ' '),
          body: lines.join('\n'), url: prefs.kinds.aufgaben && s.tasks.length ? '/#/aufgaben' : '/#/kalender',
        });
      }
    }

    // ---------- Warteschlange abarbeiten ----------
    let busy = false;
    async function tick() {
      if (busy) return;
      busy = true;
      try {
        const nowLocal = localNow();
        morning(nowLocal);
        const due = db.prepare(`SELECT q.*, s.endpoint, s.p256dh, s.auth, s.prefs FROM push_queue q
          JOIN push_subscriptions s ON s.id = q.subscription_id WHERE q.due_at <= ? ORDER BY q.id LIMIT 50`).all(new Date().toISOString());
        for (const q of due) {
          if (q.kind !== 'test' && inQuiet(prefsOf(q), nowLocal.time)) continue; // wartet bis nach der Ruhezeit
          let result;
          try {
            result = await sendPush(q, { title: q.title, body: q.body || '', url: q.url || '/', tag: q.group_key || `${q.kind}-${q.id}` },
              { keys, subject: meta('push_subject') || 'mailto:haushalt@example.com', urgency: q.kind === 'tuer' ? 'high' : 'normal' });
          } catch (err) {
            result = { ok: false, status: 0, error: err.message };
          }
          if (result.ok) {
            db.prepare('DELETE FROM push_queue WHERE id = ?').run(q.id);
          } else if (result.gone) {
            console.log('[push] Handy nicht mehr angemeldet – Abo gelöscht');
            db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(q.subscription_id);
          } else if (q.attempts + 1 >= MAX_ATTEMPTS || (result.status >= 400 && result.status < 500 && result.status !== 429)) {
            console.error(`[push] Nicht zustellbar (${result.status || result.error}) – verworfen`);
            db.prepare('DELETE FROM push_queue WHERE id = ?').run(q.id);
          } else {
            const wait = 60000 * 2 ** q.attempts; // 1, 2, 4, 8 … Minuten
            db.prepare('UPDATE push_queue SET attempts = attempts + 1, due_at = ? WHERE id = ?')
              .run(new Date(Date.now() + wait).toISOString(), q.id);
          }
        }
        // Liegengebliebenes (älter als 2 Tage) wegräumen
        db.prepare('DELETE FROM push_queue WHERE created_at < ?').run(new Date(Date.now() - 2 * 86400000).toISOString());
      } catch (err) {
        console.error('[push] Fehler:', err.message);
      } finally {
        busy = false;
      }
    }
    setInterval(tick, TICK_MS).unref();

    // ---------- Endpunkte ----------
    router.get('/api/push/key', () => ({ publicKey: keys.publicKey }));

    function readSubscription(body) {
      const endpoint = typeof body.endpoint === 'string' ? body.endpoint : '';
      if (endpoint.length > 1000 || !isPushEndpoint(endpoint, { allowLocal: ALLOW_LOCAL })) {
        throw new HttpError(400, 'Unbekannter Push-Dienst');
      }
      return endpoint;
    }

    router.post('/api/push/abo', async ({ req }) => {
      const body = await readJson(req, config.maxBodyBytes);
      const endpoint = readSubscription(body);
      const p256dh = String(body.keys?.p256dh || '');
      const auth = String(body.keys?.auth || '');
      if (!/^[A-Za-z0-9_-]{80,100}$/.test(p256dh) || !/^[A-Za-z0-9_-]{16,32}$/.test(auth)) throw new HttpError(400, 'Ungültige Schlüssel');
      const person = actorOf(db, req);
      if (!person) throw new HttpError(400, 'Bitte erst unter „Mehr“ auswählen, wer du bist');
      const prefs = checkPrefs(body.prefs || {});
      const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
      if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host) && !meta('push_subject')) setMeta('push_subject', `https://${host}`);
      const exists = db.prepare('SELECT id FROM push_subscriptions WHERE endpoint = ?').get(endpoint);
      const ts = now();
      if (exists) {
        db.prepare('UPDATE push_subscriptions SET person_id = ?, p256dh = ?, auth = ?, prefs = ?, updated_at = ? WHERE id = ?')
          .run(person, p256dh, auth, JSON.stringify(prefs), ts, exists.id);
      } else {
        if (db.prepare('SELECT COUNT(*) AS n FROM push_subscriptions').get().n >= MAX_SUBSCRIPTIONS) {
          // ältestes Abo fliegt raus (z. B. altes Handy)
          db.prepare('DELETE FROM push_subscriptions WHERE id = (SELECT id FROM push_subscriptions ORDER BY updated_at LIMIT 1)').run();
        }
        db.prepare('INSERT INTO push_subscriptions (person_id, endpoint, p256dh, auth, prefs, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run(person, endpoint, p256dh, auth, JSON.stringify(prefs), ts, ts);
      }
      return { ok: true, prefs };
    });

    router.post('/api/push/abo/aus', async ({ req }) => {
      const body = await readJson(req, config.maxBodyBytes);
      db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(String(body.endpoint || ''));
      return { ok: true };
    });

    router.post('/api/push/test', async ({ req }) => {
      const body = await readJson(req, config.maxBodyBytes);
      const sub = db.prepare('SELECT * FROM push_subscriptions WHERE endpoint = ?').get(String(body.endpoint || ''));
      if (!sub) throw new HttpError(404, 'Dieses Handy ist nicht angemeldet');
      enqueue(sub, { kind: 'test', title: 'Hallo aus dem moving castle ♡', body: 'So sehen eure Benachrichtigungen aus.', url: '/#/einstellungen' });
      setTimeout(tick, 50);
      return { ok: true };
    });

    return { list: () => [], get: () => null, tick };
  },
};
