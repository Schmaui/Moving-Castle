// Verbindung zum Server. Alle Anfragen laufen hierüber.
import { myId } from './me.js';

/** Wer gerade am Gerät ist – damit der Server weiß, wer etwas geändert hat. */
const personHeader = () => (myId() ? { 'X-Person': String(myId()) } : {});

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
      ...personHeader(),
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

  // Fotos: Bild als JPEG-Datei hochladen (nicht als JSON)
  uploadPhoto: (blob, caption = '') => uploadJpeg(`/api/photos?caption=${encodeURIComponent(caption)}`, blob),
  photoUrl: (photo) => `/api/photos/${photo.id}/bild`,

  // Profile: Profilfoto hochladen/entfernen
  uploadAvatar: (person, blob) => uploadJpeg(`/api/people/${person.id}/bild`, blob),
  removeAvatar: async (person) => (await request('DELETE', `/api/people/${person.id}/bild`)).data,
  // ?v=… ändert sich bei jedem neuen Foto -> Browser lädt das neue Bild
  avatarUrl: (person) => `/api/people/${person.id}/bild?v=${encodeURIComponent(person.photo)}`,

  // Aufgabe abhaken (bei Wiederholung legt der Server gleich die nächste an)
  completeTask: async (task, nextDue) =>
    (await request('POST', `/api/tasks/${task.id}/erledigt`, { nextDue: nextDue ?? null })).data,

  // Rezepte: von einer Webseite holen (Entwurf) und "gekocht" mitzählen
  importRecipe: async (url) => (await request('POST', '/api/recipes/import', { url })).data,
  cooked: async (recipe) => (await request('POST', `/api/recipes/${recipe.id}/gekocht`, {})).data,

  // Ordner: Datei (PDF oder JPEG) hochladen und ansehen
  uploadDoc: (folder, blob, name, note = '') => uploadFile(
    `/api/folders/${folder.id}/dateien?name=${encodeURIComponent(name)}&note=${encodeURIComponent(note)}`,
    blob, blob.type === 'application/pdf' ? 'application/pdf' : 'image/jpeg'),
  docUrl: (doc) => `/api/docs/${doc.id}/datei`,

  // Kalender: geheimen Link einer Person speichern (null = trennen) und alle neu holen
  putCalendar: async (personId, url) => (await request('PUT', `/api/calendar/${personId}`, { url })).data,
  syncCalendar: async () => (await request('POST', '/api/calendar/sync', {})).data,

  // Benachrichtigungen (siehe js/push.js)
  pushKey: async () => (await request('GET', '/api/push/key')).data,
  pushAbo: async (data) => (await request('POST', '/api/push/abo', data)).data,
  pushAboAus: async (endpoint) => (await request('POST', '/api/push/abo/aus', { endpoint })).data,
  pushTest: async (endpoint) => (await request('POST', '/api/push/test', { endpoint })).data,

  // iPhone-Widget (siehe server/modules/widget.js)
  widgetInfo: async () => (await request('GET', '/api/widget')).data,
  widgetKey: async () => (await request('POST', '/api/widget/schluessel', {})).data,
  widgetRemove: async () => (await request('DELETE', '/api/widget/schluessel')).data,
  widgetShow: async (show) => (await request('PUT', '/api/widget', { show })).data,

  patchSettings: async (patch) => (await request('PATCH', '/api/settings', patch)).data,

  // Generische Funktionen für jede Ressource ('items', 'categories', später z. B. 'tasks')
  list: async (resource) => (await request('GET', `/api/${resource}`)).data,
  create: async (resource, data) => (await request('POST', `/api/${resource}`, data)).data,
  update: async (resource, id, patch) => (await request('PATCH', `/api/${resource}/${id}`, patch)).data,
  remove: async (resource, id) => (await request('DELETE', `/api/${resource}/${id}`)).data,
};

/** Bild als JPEG-Datei hochladen (nicht als JSON). */
const uploadJpeg = (url, blob) => uploadFile(url, blob, 'image/jpeg');

/** Datei hochladen (Body = die Datei selbst). */
async function uploadFile(url, blob, type) {
  const res = await fetch(url, {
    // Als fertige Bytes schicken statt als Blob – manche Handy-Browser
    // haben beim Blob-Upload sonst einen leeren Inhalt geschickt.
    method: 'POST',
    headers: { 'Content-Type': type, ...personHeader() },
    body: await blob.arrayBuffer(),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(data?.error || `Serverfehler (${res.status})`, res.status);
  return data;
}
