// Anmeldung mit einem gemeinsamen Haushalts-Passwort.
//
// - Aktiv nur, wenn HAUSHALT_PASSWORT gesetzt ist (z. B. auf dem Online-Server).
//   Ohne Passwort (z. B. zu Hause oder zum Testen am Laptop) ist alles offen.
// - Nach dem Anmelden bekommt das Gerät ein zufälliges Sitzungs-Cookie
//   (1 Jahr gültig, verlängert sich bei Benutzung). In der Datenbank liegt nur
//   ein Hash davon, nie das Cookie selbst.
// - Passwort geändert? Dann werden beim nächsten Start alle Geräte abgemeldet.
// - Schutz vor Durchprobieren: wenige Fehlversuche pro Viertelstunde.
import crypto from 'node:crypto';
import { config } from './config.js';
import { HttpError, readJson } from './http.js';

const COOKIE = 'haushalt_session';
const SESSION_DAYS = 365;
const DAY_MS = 24 * 60 * 60 * 1000;

// Fehlversuche: pro IP und insgesamt (falls jemand viele IPs nutzt)
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS_PER_IP = 5;
const MAX_FAILS_TOTAL = 30;

// API-Pfade, die ohne Anmeldung erreichbar sind
const PUBLIC_API = new Set(['/api/health', '/api/auth', '/api/login', '/api/logout']);

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const scrypt = (password, salt) => crypto.scryptSync(String(password).normalize('NFC'), salt, 32);

export function setupAuth({ db, router }) {
  const password = config.password;
  const enabled = password.length > 0;

  if (!enabled) {
    console.log('[auth] Kein HAUSHALT_PASSWORT gesetzt – Anmeldung ist AUS (nur im Heimnetz nutzen!)');
  } else if (password.length < 10) {
    throw new Error('HAUSHALT_PASSWORT ist zu kurz – bitte mindestens 10 Zeichen verwenden.');
  }

  // Passwort-Prüfwert: zufälliges Salz pro Start, Vergleich in konstanter Zeit
  const bootSalt = crypto.randomBytes(16);
  const expected = enabled ? scrypt(password, bootSalt) : null;

  // Wurde das Passwort seit dem letzten Start geändert? -> alle Sitzungen löschen
  if (enabled) {
    const getMeta = (k) => db.prepare('SELECT value FROM meta WHERE key = ?').get(k)?.value;
    const setMeta = (k, v) => db.prepare(
      'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
    ).run(k, v);
    let salt = getMeta('pw_salt');
    if (!salt) { salt = crypto.randomBytes(16).toString('hex'); setMeta('pw_salt', salt); }
    const check = scrypt(password, Buffer.from(salt, 'hex')).toString('hex');
    if (getMeta('pw_check') !== check) {
      const { changes } = db.prepare('DELETE FROM sessions').run();
      if (changes) console.log(`[auth] Passwort geändert – ${changes} Gerät(e) abgemeldet`);
      setMeta('pw_check', check);
    }
    // Uralte Sitzungen aufräumen
    db.prepare('DELETE FROM sessions WHERE last_seen < ?')
      .run(new Date(Date.now() - SESSION_DAYS * DAY_MS).toISOString());
  }

  // ---------- Hilfsfunktionen ----------
  function clientIp(req) {
    if (config.trustProxy) {
      const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
      if (fwd) return fwd;
    }
    return req.socket.remoteAddress || '?';
  }

  function isHttps(req) {
    return Boolean(req.socket.encrypted) ||
      (config.trustProxy && req.headers['x-forwarded-proto'] === 'https');
  }

  function readCookie(req) {
    for (const part of String(req.headers.cookie || '').split(';')) {
      const [k, ...v] = part.trim().split('=');
      if (k === COOKIE) return v.join('=');
    }
    return null;
  }

  function setCookie(req, res, token, maxAgeSec) {
    const attrs = [`${COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Strict', `Max-Age=${maxAgeSec}`];
    if (isHttps(req)) attrs.push('Secure');
    res.setHeader('Set-Cookie', attrs.join('; '));
  }

  /** Gültige Sitzung zum Request finden (und gelegentlich verlängern). */
  function sessionOf(req, res) {
    const token = readCookie(req);
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const hash = sha256(token);
    const row = db.prepare('SELECT last_seen FROM sessions WHERE token_hash = ?').get(hash);
    if (!row) return null;
    const age = Date.now() - Date.parse(row.last_seen);
    if (age > SESSION_DAYS * DAY_MS) {
      db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hash);
      return null;
    }
    if (age > DAY_MS) { // höchstens einmal am Tag: "zuletzt gesehen" + Cookie verlängern
      db.prepare('UPDATE sessions SET last_seen = ? WHERE token_hash = ?').run(new Date().toISOString(), hash);
      if (res) setCookie(req, res, token, SESSION_DAYS * 86400);
    }
    return hash;
  }

  // ---------- Bremse gegen Durchprobieren ----------
  const fails = new Map(); // ip -> [Zeitpunkte]
  let totalFails = [];
  const recent = (list) => list.filter((t) => Date.now() - t < WINDOW_MS);

  function checkRateLimit(ip) {
    totalFails = recent(totalFails);
    const mine = recent(fails.get(ip) || []);
    fails.set(ip, mine);
    if (mine.length >= MAX_FAILS_PER_IP || totalFails.length >= MAX_FAILS_TOTAL) {
      const oldest = Math.min(...(mine.length >= MAX_FAILS_PER_IP ? mine : totalFails));
      const minutes = Math.max(1, Math.ceil((oldest + WINDOW_MS - Date.now()) / 60000));
      throw new HttpError(429, `Zu viele Versuche – bitte in ${minutes} Min. nochmal probieren.`);
    }
  }

  function recordFail(ip) {
    fails.set(ip, [...(fails.get(ip) || []), Date.now()]);
    totalFails.push(Date.now());
    if (fails.size > 1000) fails.clear(); // Speicher begrenzen
  }

  // ---------- Endpunkte ----------
  router.get('/api/auth', ({ req, res }) => ({
    enabled,
    loggedIn: !enabled || Boolean(sessionOf(req, res)),
  }));

  router.post('/api/login', async ({ req, res }) => {
    if (!enabled) return { ok: true };
    const ip = clientIp(req);
    checkRateLimit(ip);
    const body = await readJson(req, config.maxBodyBytes);
    const given = typeof body.password === 'string' ? body.password.slice(0, 200) : '';
    const ok = crypto.timingSafeEqual(scrypt(given, bootSalt), expected);
    if (!ok) {
      recordFail(ip);
      console.log(`[auth] Falsches Passwort von ${ip}`);
      await new Promise((r) => setTimeout(r, 400)); // kleine Bremse
      throw new HttpError(401, 'Das Passwort stimmt leider nicht.');
    }
    fails.delete(ip);
    const token = crypto.randomBytes(32).toString('base64url');
    const ts = new Date().toISOString();
    db.prepare('INSERT INTO sessions (token_hash, created_at, last_seen, user_agent) VALUES (?, ?, ?, ?)')
      .run(sha256(token), ts, ts, String(req.headers['user-agent'] || '').slice(0, 200));
    setCookie(req, res, token, SESSION_DAYS * 86400);
    console.log(`[auth] Neues Gerät angemeldet (${ip})`);
    return { ok: true };
  });

  router.post('/api/logout', ({ req, res }) => {
    const token = readCookie(req);
    if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
    setCookie(req, res, '', 0);
    return { ok: true };
  });

  /** Wirft 401, wenn für diesen API-Aufruf eine Anmeldung nötig ist und fehlt. */
  function guard(req, res, pathname) {
    if (!enabled || PUBLIC_API.has(pathname)) return;
    if (!sessionOf(req, res)) throw new HttpError(401, 'Bitte anmelden');
  }

  return { enabled, guard };
}
