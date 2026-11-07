// Mini-Router und HTTP-Helfer (ohne Framework).

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/**
 * Router mit Platzhaltern, z. B. router.patch('/api/items/:id', handler).
 * handler({ req, res, params, query }) gibt Daten zurück -> werden als JSON gesendet.
 * Für einen anderen Statuscode: { status: 201, body: {...} } zurückgeben.
 */
export function createRouter() {
  const routes = [];
  const add = (method) => (pattern, handler) => {
    const parts = pattern.split('/').filter(Boolean);
    routes.push({ method, parts, handler });
  };

  function match(method, pathname) {
    const segs = pathname.split('/').filter(Boolean);
    let pathMatched = false;
    for (const r of routes) {
      if (r.parts.length !== segs.length) continue;
      const params = {};
      const ok = r.parts.every((p, i) => {
        if (p.startsWith(':')) {
          params[p.slice(1)] = decodeURIComponent(segs[i]);
          return true;
        }
        return p === segs[i];
      });
      if (!ok) continue;
      pathMatched = true;
      if (r.method === method) return { handler: r.handler, params };
    }
    if (pathMatched) throw new HttpError(405, 'Methode nicht erlaubt');
    return null;
  }

  return {
    get: add('GET'), post: add('POST'), patch: add('PATCH'), put: add('PUT'), delete: add('DELETE'),
    match,
  };
}

export function sendJson(res, status, data, headers = {}) {
  const body = data === undefined ? '' : JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(body);
}

/** Liest einen JSON-Body. Verlangt Content-Type application/json (Schutz vor Fremd-Formularen). */
export async function readJson(req, maxBytes) {
  const type = req.headers['content-type'] || '';
  if (!type.startsWith('application/json')) {
    throw new HttpError(415, 'Content-Type muss application/json sein');
  }
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new HttpError(413, 'Anfrage zu groß');
    chunks.push(chunk);
  }
  try {
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    if (data === null || typeof data !== 'object' || Array.isArray(data)) throw new Error();
    return data;
  } catch {
    throw new HttpError(400, 'Ungültiges JSON');
  }
}
