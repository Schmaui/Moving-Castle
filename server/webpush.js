// Web-Push ohne Zusatzpakete: verschlüsselt eine Nachricht für ein Handy und schickt sie an den
// Push-Dienst (beim iPhone: Apple). Nur mit dem eingebauten node:crypto.
//
//   - Verschlüsselung nach RFC 8291 ("aes128gcm"), damit nur das Handy die Nachricht lesen kann.
//   - Absender-Ausweis nach RFC 8292 ("VAPID"): ein Schlüsselpaar, das einmal erzeugt und in der
//     Datenbank (Tabelle meta) gespeichert wird. Der öffentliche Teil geht an die Handys.
import crypto from 'node:crypto';

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const fromB64u = (s) => Buffer.from(String(s), 'base64url');

/** VAPID-Schlüssel laden oder beim ersten Mal erzeugen. */
export function loadVapidKeys(db) {
  const get = (k) => db.prepare('SELECT value FROM meta WHERE key = ?').get(k)?.value;
  let jwk = get('vapid_jwk');
  if (!jwk) {
    const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    jwk = JSON.stringify(privateKey.export({ format: 'jwk' }));
    db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run('vapid_jwk', jwk);
  }
  const parsed = JSON.parse(jwk);
  const privateKey = crypto.createPrivateKey({ key: parsed, format: 'jwk' });
  const publicKey = Buffer.concat([Buffer.from([4]), fromB64u(parsed.x), fromB64u(parsed.y)]);
  return { privateKey, publicKey: b64u(publicKey) };
}

/** Kurzer, signierter Ausweis (JWT, ES256) für einen Push-Dienst. */
function vapidJwt(audience, subject, privateKey) {
  const header = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const claims = b64u(JSON.stringify({ aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject }));
  const data = `${header}.${claims}`;
  const sig = crypto.sign('sha256', Buffer.from(data), { key: privateKey, dsaEncoding: 'ieee-p1363' });
  return `${data}.${b64u(sig)}`;
}

/** Nachricht für ein Gerät verschlüsseln (RFC 8291). */
export function encrypt(payload, { p256dh, auth }) {
  const uaPublic = fromB64u(p256dh);
  const authSecret = fromB64u(auth);
  if (uaPublic.length !== 65 || authSecret.length < 16) throw new Error('Ungültige Geräte-Schlüssel');
  const ecdh = crypto.createECDH('prime256v1');
  const asPublic = ecdh.generateKeys();
  const shared = ecdh.computeSecret(uaPublic);
  const ikm = Buffer.from(crypto.hkdfSync('sha256', shared, authSecret,
    Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]), 32));
  const salt = crypto.randomBytes(16);
  const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const body = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const head = Buffer.alloc(21);
  salt.copy(head, 0);
  head.writeUInt32BE(4096, 16);
  head.writeUInt8(asPublic.length, 20);
  return Buffer.concat([head, asPublic, body]);
}

/**
 * Nachricht an ein Gerät schicken. Ergebnis: { ok, status, gone }
 * gone = true -> das Gerät gibt es nicht mehr (Abo löschen).
 */
export async function sendPush(sub, payload, { keys, subject, ttl = 24 * 3600, urgency = 'normal' }) {
  const url = new URL(sub.endpoint);
  const jwt = vapidJwt(`${url.protocol}//${url.host}`, subject, keys.privateKey);
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: `vapid t=${jwt}, k=${keys.publicKey}`,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(ttl),
      Urgency: urgency,
    },
    body: encrypt(JSON.stringify(payload), sub),
    signal: AbortSignal.timeout(15000),
    redirect: 'error',
  });
  await res.arrayBuffer().catch(() => null);
  return { ok: res.ok, status: res.status, gone: res.status === 404 || res.status === 410 };
}

/** Nur echte Push-Dienste anschreiben (Schutz davor, dass der Server beliebige Adressen aufruft). */
const PUSH_HOSTS = [/\.push\.apple\.com$/, /^fcm\.googleapis\.com$/, /\.push\.services\.mozilla\.com$/, /\.notify\.windows\.com$/];
export function isPushEndpoint(endpoint, { allowLocal = false } = {}) {
  let url;
  try { url = new URL(endpoint); } catch { return false; }
  if (allowLocal && url.protocol === 'http:' && url.hostname === '127.0.0.1') return true;
  return url.protocol === 'https:' && PUSH_HOSTS.some((re) => re.test(url.hostname));
}
