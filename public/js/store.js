// Zentraler Datenspeicher im Browser + Synchronisation mit dem Server.
//
// - state enthält alles, was der Server unter /api/state liefert
//   (categories, items, und später automatisch neue Module).
// - Ansichten lesen nur aus state und rufen Aktionen (unten) auf.
// - Aktionen ändern state sofort ("optimistisch"), damit es sich flott anfühlt,
//   und schicken die Änderung dann an den Server.
import { api } from './api.js';
import { CONFIG } from './config.js';

export const state = {
  loaded: false,
  online: true,
  needsLogin: false,   // true = Anmeldeseite zeigen
  authEnabled: false,  // true = Server verlangt ein Passwort (dann gibt es "Abmelden")
  rev: null,
  categories: [],
  items: [],
  photos: [],
};

const listeners = new Set();
let etag = null;
let pending = 0;          // laufende Änderungen -> solange nicht überschreiben
let refreshing = null;
let errorHandler = (msg) => console.error(msg);

export const subscribe = (fn) => (listeners.add(fn), () => listeners.delete(fn));
export const onError = (fn) => { errorHandler = fn; };
const emit = () => listeners.forEach((fn) => fn(state));

function setOnline(online) {
  if (state.online === online) return;
  state.online = online;
  emit();
}

/** Server verlangt Anmeldung -> Anmeldeseite zeigen. */
function requireLogin() {
  etag = null;
  if (state.needsLogin) return;
  state.needsLogin = true;
  state.authEnabled = true;
  emit();
}

/** Holt neue Daten vom Server (nur wenn sich etwas geändert hat). */
export function refresh() {
  if (pending > 0 || state.needsLogin) return Promise.resolve();
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const res = await api.getState(etag);
      setOnline(true);
      if (res.status === 304 || pending > 0) return;
      etag = res.etag;
      Object.assign(state, res.data, { loaded: true });
      emit();
    } catch (err) {
      if (err.status === 401) requireLogin();
      else setOnline(false);
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

/** Regelmäßig abgleichen + sofort beim Zurückkehren in die App. */
export function startSync() {
  api.auth()
    .then((a) => {
      state.authEnabled = a.enabled;
      if (!a.loggedIn) requireLogin();
      else refresh();
    })
    .catch(() => refresh());
  setInterval(() => {
    if (document.visibilityState === 'visible') refresh();
  }, CONFIG.pollIntervalMs);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refresh();
  });
  window.addEventListener('focus', refresh);
  window.addEventListener('online', refresh);
  window.addEventListener('pageshow', refresh);
}

/**
 * Führt eine Änderung aus: erst lokal (applyLocal), dann auf dem Server (request).
 * Bei Fehler: Meldung anzeigen und Serverstand neu laden.
 */
async function mutate(applyLocal, request) {
  pending++;
  if (applyLocal) {
    applyLocal();
    emit();
  }
  try {
    const result = await request();
    setOnline(true);
    return result;
  } catch (err) {
    if (err.status === 401) { requireLogin(); return null; }
    if (!err.status) setOnline(false);
    errorHandler(err.message || 'Speichern fehlgeschlagen');
    etag = null; // beim nächsten Abgleich alles neu laden
    return null;
  } finally {
    pending--;
    if (pending === 0) refresh();
  }
}

/** Anmelden. Wirft bei falschem Passwort einen Fehler mit Meldung. */
export async function login(password) {
  await api.login(password);
  state.needsLogin = false;
  etag = null;
  emit();
  await refresh();
}

/** Dieses Gerät abmelden. */
export async function logout() {
  try { await api.logout(); } catch { /* egal – lokal trotzdem abmelden */ }
  state.loaded = false;
  state.categories = [];
  state.photos = [];
  state.items = [];
  requireLogin();
}

const findItem = (id) => state.items.find((i) => i.id === id);

// ======================= Aktionen =======================

export function setMissing(item, missing) {
  return mutate(
    () => { const it = findItem(item.id); if (it) it.missing = missing; },
    () => api.update('items', item.id, { missing })
  );
}

export function addItem(categoryId, name, extra = {}) {
  return mutate(null, () => api.create('items', { categoryId, name, ...extra }));
}

export function updateItem(item, patch) {
  return mutate(
    () => Object.assign(findItem(item.id) || {}, patch),
    () => api.update('items', item.id, patch)
  );
}

export function deleteItem(item) {
  return mutate(
    () => { state.items = state.items.filter((i) => i.id !== item.id); },
    () => api.remove('items', item.id)
  );
}

/** Gelöschten Artikel wiederherstellen (für "Rückgängig"). */
export function restoreItem(item) {
  const { categoryId, name, missing, quantity, unit, note, sort } = item;
  return mutate(null, () => api.create('items', { categoryId, name, missing, quantity, unit, note, sort }));
}

export function addCategory(name, icon) {
  const sort = Math.max(-1, ...state.categories.map((c) => c.sort)) + 1;
  return mutate(null, () => api.create('categories', { name, icon: icon || CONFIG.defaultIcon, sort }));
}

export function deleteCategory(category) {
  return mutate(
    () => { state.categories = state.categories.filter((c) => c.id !== category.id); },
    () => api.remove('categories', category.id)
  );
}

// ---------- Fotos ----------
export function addPhoto(blob, caption) {
  return mutate(null, () => api.uploadPhoto(blob, caption));
}

export function deletePhoto(photo) {
  return mutate(
    () => { state.photos = state.photos.filter((p) => p.id !== photo.id); },
    () => api.remove('photos', photo.id)
  );
}
