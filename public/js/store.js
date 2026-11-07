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
  recipes: [],
  meals: [],
  wishes: [],
  links: [],
  notes: [],
  noteFiles: [],
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
  state.recipes = [];
  state.meals = [];
  state.wishes = [];
  state.notes = [];
  state.noteFiles = [];
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
  const { categoryId, name, missing, quantity, unit, note, sort, minQty } = item;
  return mutate(null, () => api.create('items', { categoryId, name, missing, quantity, unit, note, sort, minQty }));
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

// ---------- Mengen im Vorrat ----------
/** Eingekauft: Menge setzen (der Server entscheidet dann selbst, ob es noch fehlt). */
export function buyItem(item, quantity) {
  const patch = quantity == null ? { missing: false } : { missing: false, quantity };
  return mutate(
    () => Object.assign(findItem(item.id) || {}, { missing: false }, quantity == null ? {} : { quantity }),
    () => api.update('items', item.id, patch)
  );
}

// ---------- Rezepte ----------
const findRecipe = (id) => state.recipes.find((r) => r.id === id);
export const recipeById = (id) => findRecipe(Number(id)) || null;

export function addRecipe(data) {
  return mutate(null, () => api.create('recipes', data));
}

export function updateRecipe(recipe, patch) {
  return mutate(
    () => Object.assign(findRecipe(recipe.id) || {}, patch),
    () => api.update('recipes', recipe.id, patch)
  );
}

export function deleteRecipe(recipe) {
  return mutate(
    () => {
      state.recipes = state.recipes.filter((r) => r.id !== recipe.id);
      state.meals = state.meals.filter((m) => m.recipeId !== recipe.id);
    },
    () => api.remove('recipes', recipe.id)
  );
}

/** Rezept von einer Webseite holen (nur Entwurf). Wirft bei Fehler. */
export const importRecipe = (url) => api.importRecipe(url);

/** Gekocht: Vorrat anpassen (changes = [{ item, quantity } | { item, empty: true }]) und mitzählen. */
export async function cookRecipe(recipe, changes, meal) {
  for (const c of changes) {
    if (c.empty) await setMissing(c.item, true);
    else await updateItem(c.item, { quantity: c.quantity });
  }
  if (meal) await updateMeal(meal, { cooked: true, chosen: true });
  if (recipe) return mutate(null, () => api.cooked(recipe));
  return true;
}

/** Zutat fest einem Vorratsartikel zuordnen (itemId null = nicht im Vorrat, undefined = wieder automatisch). */
export function linkIngredient(key, itemId) {
  const existing = state.links.find((l) => l.nameKey === key);
  if (itemId === undefined) {
    if (!existing) return Promise.resolve(null);
    return mutate(() => { state.links = state.links.filter((l) => l !== existing); }, () => api.remove('links', existing.id));
  }
  if (existing) return mutate(() => { existing.itemId = itemId; }, () => api.update('links', existing.id, { itemId }));
  return mutate(() => { state.links = [...state.links, { id: -1, nameKey: key, itemId }]; }, () => api.create('links', { nameKey: key, itemId }));
}

// ---------- Wochenplan ----------
export function addMeal(data) {
  return mutate(null, () => api.create('meals', data));
}

export function updateMeal(meal, patch) {
  return mutate(
    () => Object.assign(state.meals.find((m) => m.id === meal.id) || {}, patch),
    () => api.update('meals', meal.id, patch)
  );
}

export function deleteMeal(meal) {
  return mutate(
    () => { state.meals = state.meals.filter((m) => m.id !== meal.id); },
    () => api.remove('meals', meal.id)
  );
}

/** "Das gibt's": diesen Vorschlag wählen, den anderen am selben Abend abwählen. */
export async function chooseMeal(meal) {
  const other = state.meals.find((m) => m.day === meal.day && m.id !== meal.id && m.chosen);
  if (other) await updateMeal(other, { chosen: false });
  return updateMeal(meal, { chosen: !meal.chosen });
}

// ---------- Wunschzettel ----------
export function addWish(name, amount = null, recipeId = null) {
  return mutate(null, () => api.create('wishes', { name, amount, recipeId }));
}

export function deleteWish(wish) {
  return mutate(
    () => { state.wishes = state.wishes.filter((w) => w.id !== wish.id); },
    () => api.remove('wishes', wish.id)
  );
}

export function restoreWish(wish) {
  return addWish(wish.name, wish.amount, wish.recipeId);
}

// ---------- Pinnwand ----------
const findNote = (id) => state.notes.find((n) => n.id === id);

export function addNote(data) {
  return mutate(null, () => api.create('notes', data));
}

export function updateNote(note, patch) {
  return mutate(
    () => Object.assign(findNote(note.id) || {}, patch),
    () => api.update('notes', note.id, patch)
  );
}

/** Zettel abnehmen (angehängte Dateien werden mit gelöscht). */
export function deleteNote(note) {
  return mutate(
    () => {
      state.notes = state.notes.filter((n) => n.id !== note.id);
      state.noteFiles = state.noteFiles.filter((f) => f.noteId !== note.id);
    },
    () => api.remove('notes', note.id)
  );
}

/** Abgenommenen Zettel wieder anpinnen (für "Rückgängig", nur ohne Dateien). */
export function restoreNote(note) {
  const { kind, title, body, secret, data, sort } = note;
  return mutate(null, () => api.create('notes', { kind, title, body, secret, data, sort }));
}

/** Dateien eines Zettels (älteste zuerst). */
export const filesOf = (note) => (state.noteFiles || []).filter((f) => f.noteId === note.id);

export function uploadNoteFile(note, blob, name) {
  return mutate(null, () => api.uploadNoteFile(note, blob, name));
}

export function deleteNoteFile(file) {
  return mutate(
    () => { state.noteFiles = state.noteFiles.filter((f) => f.id !== file.id); },
    () => api.remove('note-files', file.id)
  );
}
