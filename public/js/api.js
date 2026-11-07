// Verbindung zum Server. Alle Anfragen laufen hierüber.

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(method, url, body, headers = {}) {
  const res = await fetch(url, {
    method,
    cache: 'no-store',
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 304) return { status: 304 };
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* keine JSON-Antwort */ }
  if (!res.ok) throw new ApiError(data?.error || `Serverfehler (${res.status})`, res.status);
  return { status: res.status, data, etag: res.headers.get('ETag') };
}

export const api = {
  /** Gesamter Zustand. Mit etag: liefert {status: 304}, wenn unverändert. */
  getState: (etag) => request('GET', '/api/state', undefined, etag ? { 'If-None-Match': etag } : {}),

  // Anmeldung (nur aktiv, wenn auf dem Server ein Passwort gesetzt ist)
  auth: async () => (await request('GET', '/api/auth')).data,
  login: async (password) => (await request('POST', '/api/login', { password })).data,
  logout: async () => (await request('POST', '/api/logout', {})).data,

  // Generische Funktionen für jede Ressource ('items', 'categories', später z. B. 'tasks')
  list: async (resource) => (await request('GET', `/api/${resource}`)).data,
  create: async (resource, data) => (await request('POST', `/api/${resource}`, data)).data,
  update: async (resource, id, patch) => (await request('PATCH', `/api/${resource}/${id}`, patch)).data,
  remove: async (resource, id) => (await request('DELETE', `/api/${resource}/${id}`)).data,
};
