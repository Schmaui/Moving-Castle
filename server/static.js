// Liefert die Dateien aus public/ aus (HTML, CSS, JS, Icons).
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { HttpError } from './http.js';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

export function serveStatic(req, res, pathname) {
  let rel;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    throw new HttpError(400, 'Ungültiger Pfad');
  }
  if (rel.endsWith('/')) rel += 'index.html';
  // Schutz: niemals aus public/ heraus (z. B. /../server/db.js)
  const file = path.resolve(config.publicDir, '.' + path.posix.normalize(rel));
  if (!file.startsWith(config.publicDir + path.sep)) throw new HttpError(404, 'Nicht gefunden');

  let stat;
  try {
    stat = fs.statSync(file);
  } catch {
    throw new HttpError(404, 'Nicht gefunden');
  }
  if (!stat.isFile()) throw new HttpError(404, 'Nicht gefunden');

  const lastModified = stat.mtime.toUTCString();
  const headers = {
    'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
    // "no-cache" = Browser darf speichern, fragt aber jedes Mal nach Änderungen.
    // So kommen Design-Änderungen sofort auf allen Geräten an.
    'Cache-Control': 'no-cache',
    'Last-Modified': lastModified,
  };
  if (req.headers['if-modified-since'] === lastModified) {
    res.writeHead(304, headers);
    return res.end();
  }
  res.writeHead(200, { ...headers, 'Content-Length': stat.size });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
}
