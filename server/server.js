// Einstiegspunkt: startet den HTTP-Server.
import http from 'node:http';
import crypto from 'node:crypto';
import { config } from './config.js';
import { openDatabase, getRev } from './db.js';
import { seedIfEmpty } from './seed.js';
import { createRouter, sendJson, HttpError } from './http.js';
import { serveStatic } from './static.js';
import { MODULES } from './modules/index.js';
import { setupAuth } from './auth.js';

const db = openDatabase();
seedIfEmpty(db, config.seedFile);

const router = createRouter();
const auth = setupAuth({ db, router });
const ctx = { db, router, resources: {} };
for (const mod of MODULES) ctx.resources[mod.name] = { mod, api: mod.register(ctx) };

// Zufällige Kennung pro Serverstart: falls die DB z. B. aus einem Backup
// zurückgespielt wird, laden alle Geräte garantiert neu.
const BOOT_ID = crypto.randomBytes(4).toString('hex');

// Gesamter Zustand in einem Rutsch (dafür pollen die Geräte).
// Antwortet mit 304, wenn sich seit dem letzten Abruf nichts geändert hat.
router.get('/api/state', ({ req, res }) => {
  const rev = getRev(db);
  const etag = `"${BOOT_ID}-${rev}"`;
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, { ETag: etag, 'Cache-Control': 'no-cache' });
    res.end();
    return undefined;
  }
  const state = { rev };
  for (const [name, { mod, api }] of Object.entries(ctx.resources)) {
    if (mod.inState) state[name] = api.list();
  }
  sendJson(res, 200, state, { ETag: etag, 'Cache-Control': 'no-cache' });
  return undefined;
});

router.get('/api/health', () => ({ ok: true }));

// Sicherheits-Header für alle Antworten
function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; img-src 'self' data: blob:; style-src 'self'; script-src 'self'; " +
    "connect-src 'self'; manifest-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
  );
}

const server = http.createServer(async (req, res) => {
  securityHeaders(res);
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) {
      auth.guard(req, res, url.pathname);
      const m = router.match(req.method, url.pathname);
      if (!m) throw new HttpError(404, 'Unbekannter API-Pfad');
      const result = await m.handler({ req, res, params: m.params, query: url.searchParams });
      if (res.headersSent) return; // Handler hat selbst geantwortet
      if (result && typeof result === 'object' && 'status' in result && 'body' in result) {
        sendJson(res, result.status, result.body);
      } else {
        sendJson(res, 200, result);
      }
      if (req.method !== 'GET') console.log(`[api] ${req.method} ${url.pathname}`);
    } else if (req.method === 'GET' || req.method === 'HEAD') {
      serveStatic(req, res, url.pathname);
    } else {
      throw new HttpError(405, 'Methode nicht erlaubt');
    }
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    if (status === 500) console.error('[error]', err);
    if (res.headersSent) return res.end();
    sendJson(res, status, { error: status === 500 ? 'Interner Fehler' : err.message });
  }
});

server.listen(config.port, config.host, () => {
  console.log(`[server] Haushalt läuft auf http://${config.host}:${config.port}`);
});

// Sauber beenden (docker stop)
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    server.close();
    db.close();
    process.exit(0);
  });
}
