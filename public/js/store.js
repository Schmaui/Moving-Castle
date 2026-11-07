// Zentraler Datenspeicher im Browser + Synchronisation mit dem Server.
//
// - state enthält alles, was der Server unter /api/state liefert
//   (categories, items, und später automatisch neue Module).
// - Ansichten lesen nur aus state und rufen Aktionen (unten) auf.
// - Aktionen ändern state sofort ("optimistisch"), damit es sich flott anfühlt,
//   und schicken die Änderung dann an den Server.
import { api } from './api.js';
import { CONFIG } from './config.js';
import { myId } from './me.js';

export const state = {
  loaded: false,
  online: true,
  needsLogin: false,   // true = Anmeldeseite zeigen
  authEnabled: false,  // true = Server verlangt ein Passwort (dann gibt es "Abmelden")
  rev: null,
  categories: [],
  items: [],
  photos: [],
  settings: {},
  people: [],
  tasks: [],
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
  state.tasks = [];
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

export function updatePhoto(photo, patch) {
  return mutate(
    () => Object.assign(state.photos.find((p) => p.id === photo.id) || {}, patch),
    () => api.update('photos', photo.id, patch)
  );
}

/** Fotos in Reihenfolge (so hängen sie an der Tür). */
export const sortedPhotos = () =>
  [...(state.photos || [])].sort((a, b) => a.sort - b.sort || a.id - b.id);

/** Foto eine Position nach vorn (-1) oder hinten (+1) schieben. */
export async function movePhoto(photo, dir) {
  const list = sortedPhotos();
  const from = list.findIndex((p) => p.id === photo.id);
  const to = from + dir;
  if (from < 0 || to < 0 || to >= list.length) return;
  [list[from], list[to]] = [list[to], list[from]];
  // neue Reihenfolge durchnummerieren, nur Geänderte speichern
  await Promise.all(list.map((p, i) => (p.sort !== i ? updatePhoto(p, { sort: i }) : null)));
}

// ---------- Gemeinsame Einstellungen ----------
export function updateSettings(patch) {
  return mutate(
    () => { state.settings = { ...state.settings, ...patch }; },
    () => api.patchSettings(patch)
  );
}

// ---------- Profile ----------
export const personById = (id) => (id == null ? null : state.people.find((p) => p.id === id) || null);

/** Die Person, die gerade dieses Gerät benutzt (oder null, wenn noch nicht gewählt). */
export const me = () => personById(myId());

export function updatePerson(person, patch) {
  return mutate(
    () => Object.assign(personById(person.id) || {}, patch),
    () => api.update('people', person.id, patch)
  );
}

export function uploadAvatar(person, blob) {
  return mutate(null, () => api.uploadAvatar(person, blob));
}

export function removeAvatar(person) {
  return mutate(
    () => { const p = personById(person.id); if (p) p.photo = null; },
    () => api.removeAvatar(person)
  );
}

// ---------- Aufgaben ----------
const findTask = (id) => state.tasks.find((t) => t.id === id);

export function addTask(data) {
  return mutate(null, () => api.create('tasks', data));
}

export function updateTask(task, patch) {
  return mutate(
    () => Object.assign(findTask(task.id) || {}, patch),
    () => api.update('tasks', task.id, patch)
  );
}

/** Abhaken. Gibt { task, next } zurück (next = nächste Wiederholung oder null). */
export function completeTask(task, nextDue) {
  return mutate(
    () => {
      const t = findTask(task.id);
      if (t) Object.assign(t, { done: true, doneBy: myId(), doneAt: new Date().toISOString() });
    },
    () => api.completeTask(task, nextDue)
  );
}

/** "Rückgängig" nach dem Abhaken: wieder offen, eine schon angelegte Wiederholung weg. */
export async function reopenTask(task, next) {
  if (next) {
    await mutate(
      () => { state.tasks = state.tasks.filter((t) => t.id !== next.id); },
      () => api.remove('tasks', next.id)
    );
  }
  return updateTask(task, { done: false });
}

export function deleteTask(task) {
  return mutate(
    () => { state.tasks = state.tasks.filter((t) => t.id !== task.id); },
    () => api.remove('tasks', task.id)
  );
}

/** Gelöschte Aufgabe wiederherstellen (für "Rückgängig"). */
export function restoreTask(task) {
  const { title, note, due, repeat, assigneeId } = task;
  return mutate(null, () => api.create('tasks', { title, note, due, repeat, assigneeId }));
}
