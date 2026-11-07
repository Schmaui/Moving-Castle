// API-Tests: startet einen Server mit leerer Test-Datenbank und prüft alle Endpunkte.
// Aufruf: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';

const PORT = 18000 + Math.floor(Math.random() * 1000);
const BASE = `http://127.0.0.1:${PORT}`;
let proc, dataDir;

const json = (method, url, body) =>
  fetch(BASE + url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  }).then(async (r) => ({ status: r.status, headers: r.headers, body: await r.json().catch(() => null) }));

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'haushalt-test-'));
  proc = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/server.js'], {
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, IMPORT_ALLOW_PRIVATE: '1', PUSH_ALLOW_LOCAL: '1', PUSH_TICK_MS: '100', PUSH_LIST_DELAY_MS: '400' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(BASE + '/api/health')).ok) return; } catch { /* startet noch */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('Server startet nicht');
});

after(() => {
  proc?.kill();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('Startdaten werden eingelesen', async () => {
  const { status, body } = await json('GET', '/api/state');
  assert.equal(status, 200);
  assert.equal(body.categories.length, 13);
  assert.equal(body.items.length, 107);
  const house = body.categories.filter((c) => c.area === 'haushalt').map((c) => c.name);
  assert.deepEqual(house, ['Bad & Körperpflege', 'Putzen & Wäsche', 'Haushalt & Sonstiges']);
  assert.ok(body.items.some((i) => i.name === 'Zahnpasta'), 'Haushalts-Artikel sind dabei');
  assert.ok(body.items.some((i) => i.name === 'Olivenöl'), 'Grundzutaten sind dabei');
  assert.equal(body.categories[0].name, 'Konserven');
  assert.equal(body.categories[0].emoji, '🥫');
  assert.ok(body.items.every((i) => i.missing === false));
});

test('ETag: unveränderter Zustand liefert 304', async () => {
  const first = await fetch(BASE + '/api/state');
  const etag = first.headers.get('etag');
  assert.ok(etag);
  const second = await fetch(BASE + '/api/state', { headers: { 'If-None-Match': etag } });
  assert.equal(second.status, 304);
});

test('Artikel als fehlend markieren und wieder abhaken', async () => {
  const r1 = await json('PATCH', '/api/items/1', { missing: true });
  assert.equal(r1.status, 200);
  assert.equal(r1.body.missing, true);
  assert.ok(r1.body.missingSince);

  const list = await json('GET', '/api/items?missing=true');
  assert.deepEqual(list.body.map((i) => i.id), [1]);

  const r2 = await json('PATCH', '/api/items/1', { missing: false });
  assert.equal(r2.body.missing, false);
  assert.equal(r2.body.missingSince, null);
});

test('Artikel anlegen (mit Menge/Einheit/Notiz), Duplikat ablehnen, löschen', async () => {
  const created = await json('POST', '/api/items', {
    categoryId: 7, name: '  Hafermilch ', quantity: 2, unit: 'l', note: 'Barista',
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.name, 'Hafermilch');
  assert.equal(created.body.quantity, 2);

  const dup = await json('POST', '/api/items', { categoryId: 7, name: 'hafermilch' });
  assert.equal(dup.status, 409);

  const del = await json('DELETE', `/api/items/${created.body.id}`);
  assert.equal(del.status, 200);
  assert.equal(del.body.name, 'Hafermilch');
  assert.equal((await json('GET', `/api/items/${created.body.id}`)).status, 404);
});

test('Eingaben werden geprüft', async () => {
  assert.equal((await json('POST', '/api/items', { categoryId: 1 })).status, 400);              // Name fehlt
  assert.equal((await json('POST', '/api/items', { categoryId: 999, name: 'X' })).status, 400); // Kategorie fehlt
  assert.equal((await json('POST', '/api/items', { categoryId: 1, name: 'x'.repeat(81) })).status, 400);
  assert.equal((await json('POST', '/api/items', { categoryId: 1, name: 'X', hack: 1 })).status, 400);
  assert.equal((await json('PATCH', '/api/items/1', { missing: 'ja' })).status, 400);
  assert.equal((await json('PATCH', '/api/items/1', { missingSince: 'x' })).status, 400);       // schreibgeschützt
  const noJson = await fetch(BASE + '/api/items', { method: 'POST', body: 'name=X' });
  assert.equal(noJson.status, 415);
});

test('HTML wird als Text gespeichert, Steuerzeichen entfernt', async () => {
  const r = await json('POST', '/api/items', { categoryId: 1, name: '<img src=x onerror=alert(1)>\u0007' });
  assert.equal(r.status, 201);
  assert.equal(r.body.name, '<img src=x onerror=alert(1)>');
  await json('DELETE', `/api/items/${r.body.id}`);
});

test('Kategorien: anlegen, volle nicht löschbar, leere löschbar', async () => {
  const cat = await json('POST', '/api/categories', { name: 'Getränke', emoji: '🥤' });
  assert.equal(cat.status, 201);
  assert.equal(cat.body.area, 'kueche', 'neue Kategorien landen standardmäßig im Vorrat');
  const moved = await json('PATCH', `/api/categories/${cat.body.id}`, { area: 'haushalt' });
  assert.equal(moved.body.area, 'haushalt');
  assert.equal((await json('PATCH', `/api/categories/${cat.body.id}`, { area: 'garten' })).status, 400);
  const full = await json('DELETE', '/api/categories/1');
  assert.equal(full.status, 409);
  const empty = await json('DELETE', `/api/categories/${cat.body.id}`);
  assert.equal(empty.status, 200);
});

test('Statische Dateien und Schutz vor Pfad-Tricks', async () => {
  const index = await fetch(BASE + '/');
  assert.equal(index.status, 200);
  assert.match(index.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal((await fetch(BASE + '/%2e%2e/server/db.js')).status, 404);
  assert.equal((await fetch(BASE + '/css/tokens.css')).status, 200);
});

// ---------- Profile, "wer hat was gemacht", Aufgaben ----------
const as = (person, method, url, body) =>
  fetch(BASE + url, {
    method,
    headers: { 'X-Person': String(person), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

// kleinstes gültiges JPEG-ähnliches Stück: FF D8 FF + Füllbytes
const fakeJpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 1)]);

test('Profile: wir zwei sind angelegt und änderbar', async () => {
  const { body } = await json('GET', '/api/state');
  assert.deepEqual(body.people.map((p) => p.name), ['Kait', 'Schmaui']);
  const r = await json('PATCH', '/api/people/2', { figure: 'pilz', tone: 3 });
  assert.equal(r.body.figure, 'pilz');
  assert.equal((await json('PATCH', '/api/people/2', { figure: 'drache' })).status, 400);
  assert.equal((await json('PATCH', '/api/people/2', { tone: 9 })).status, 400);
});

test('Profilfoto hochladen und entfernen', async () => {
  const up = await fetch(BASE + '/api/people/1/bild', { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: fakeJpeg });
  assert.equal(up.status, 200);
  const person = await up.json();
  assert.match(person.photo, /^profil-[0-9a-f]+\.jpg$/);
  const img = await fetch(BASE + '/api/people/1/bild');
  assert.equal(img.status, 200);
  assert.equal(img.headers.get('content-type'), 'image/jpeg');
  const bad = await fetch(BASE + '/api/people/1/bild', { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: 'hallo'.repeat(30) });
  assert.equal(bad.status, 400);
  const del = await json('DELETE', '/api/people/1/bild');
  assert.equal(del.body.photo, null);
  assert.equal((await fetch(BASE + '/api/people/1/bild')).status, 404);
});

test('Einkaufsliste merkt sich, wer draufgesetzt und wer gekauft hat', async () => {
  const on = await as(2, 'PATCH', '/api/items/3', { missing: true });
  assert.equal(on.body.missingBy, 2);
  const off = await as(1, 'PATCH', '/api/items/3', { missing: false });
  assert.equal(off.body.missingBy, null);
  assert.equal(off.body.boughtBy, 1);
  assert.ok(off.body.boughtAt);
  // unbekannte Person wird ignoriert
  const unknown = await as(99, 'PATCH', '/api/items/3', { missing: true });
  assert.equal(unknown.body.missingBy, null);
  await json('PATCH', '/api/items/3', { missing: false });
});

test('Fotos merken sich, wer sie aufgehängt hat', async () => {
  const r = await fetch(BASE + '/api/photos?caption=Urlaub', {
    method: 'POST', headers: { 'Content-Type': 'image/jpeg', 'X-Person': '2' }, body: fakeJpeg,
  });
  assert.equal(r.status, 201);
  const photo = await r.json();
  assert.equal(photo.addedBy, 2);
  await json('DELETE', `/api/photos/${photo.id}`);
});

test('Aufgaben: anlegen, prüfen, bearbeiten, löschen', async () => {
  const t = await as(1, 'POST', '/api/tasks', { title: ' Altglas wegbringen ', due: '2026-11-10', assigneeId: 2, note: 'Zeile 1\nZeile 2' });
  assert.equal(t.status, 201);
  assert.equal(t.body.title, 'Altglas wegbringen');
  assert.equal(t.body.createdBy, 1);
  assert.equal(t.body.note, 'Zeile 1\nZeile 2');
  assert.equal(t.body.done, false);

  assert.equal((await json('POST', '/api/tasks', { title: '' })).status, 400);
  assert.equal((await json('POST', '/api/tasks', { title: 'x', due: '10.11.2026' })).status, 400);
  assert.equal((await json('POST', '/api/tasks', { title: 'x', repeat: 'jaehrlich' })).status, 400);
  assert.equal((await json('POST', '/api/tasks', { title: 'x', assigneeId: 99 })).status, 400);
  assert.equal((await json('POST', '/api/tasks', { title: 'x', createdBy: 2 })).status, 400); // schreibgeschützt

  const done = await as(2, 'PATCH', `/api/tasks/${t.body.id}`, { done: true });
  assert.equal(done.body.doneBy, 2);
  assert.ok(done.body.doneAt);
  const reopened = await as(1, 'PATCH', `/api/tasks/${t.body.id}`, { done: false, due: null });
  assert.equal(reopened.body.doneBy, null);
  assert.equal(reopened.body.due, null);

  assert.equal((await json('DELETE', `/api/tasks/${t.body.id}`)).status, 200);
});

test('Aufgaben: abhaken mit Wiederholung legt die nächste an', async () => {
  const t = await as(1, 'POST', '/api/tasks', { title: 'Bad putzen', due: '2026-11-07', repeat: 'woechentlich' });
  const r = await as(2, 'POST', `/api/tasks/${t.body.id}/erledigt`, { nextDue: '2026-11-14' });
  assert.equal(r.status, 200);
  assert.equal(r.body.task.done, true);
  assert.equal(r.body.task.doneBy, 2);
  assert.equal(r.body.next.due, '2026-11-14');
  assert.equal(r.body.next.repeat, 'woechentlich');
  assert.equal(r.body.next.createdBy, 1);
  assert.equal(r.body.next.done, false);

  // zweimal abhaken (z. B. beide Handys gleichzeitig) legt keine zweite an
  const again = await as(1, 'POST', `/api/tasks/${t.body.id}/erledigt`, { nextDue: '2026-11-14' });
  assert.equal(again.body.next, null);
  const { body } = await json('GET', '/api/state');
  assert.equal(body.tasks.filter((x) => x.title === 'Bad putzen' && !x.done).length, 1);

  // ohne Wiederholung: keine neue Aufgabe
  const once = await json('POST', '/api/tasks', { title: 'Einmalig' });
  const r2 = await json('POST', `/api/tasks/${once.body.id}/erledigt`, {});
  assert.equal(r2.body.next, null);
});

// ---------- Kochen: Mengen, Rezepte, Wochenplan, Wunschzettel ----------
test('Mengen: unter der Mindestmenge fehlt es von selbst, Einkaufen füllt auf', async () => {
  const a = await json('PATCH', '/api/items/2', { quantity: 3, minQty: 2, unit: 'Dose' });
  assert.equal(a.body.missing, false);
  const b = await as(1, 'PATCH', '/api/items/2', { quantity: 1 });
  assert.equal(b.body.missing, true, 'unter Mindestmenge -> fehlt');
  assert.equal(b.body.missingBy, 1);
  const c = await json('PATCH', '/api/items/2', { missing: false });
  assert.equal(c.body.quantity, 2, 'abgehakt ohne Menge -> auf Mindestmenge aufgefüllt');
  const d = await json('PATCH', '/api/items/2', { missing: false, quantity: 5 });
  assert.equal(d.body.quantity, 5);
  const e = await json('PATCH', '/api/items/2', { missing: true, quantity: 5 });
  assert.equal(e.body.missing, true, 'Rückgängig: ausdrücklich "fehlt" bleibt');
  await json('PATCH', '/api/items/2', { quantity: null, minQty: null, unit: null, missing: false });
});

test('Rezepte: anlegen, prüfen, gekocht zählen, löschen', async () => {
  const r = await as(2, 'POST', '/api/recipes', {
    title: 'Linsen-Curry',
    ingredients: [{ qty: 200, unit: 'g', name: 'rote Linsen', note: null }, { qty: null, unit: null, name: 'Reis', note: null }],
    tags: ['schnell', 'schnell', '  '],
    minutes: 30,
    sourceUrl: 'https://example.org/curry',
  });
  assert.equal(r.status, 201);
  assert.equal(r.body.createdBy, 2);
  assert.deepEqual(r.body.tags, ['schnell']);
  assert.equal(r.body.ingredients[0].name, 'rote Linsen');

  assert.equal((await json('POST', '/api/recipes', { title: 'x', ingredients: [{ qty: 'viel', name: 'a' }] })).status, 400);
  assert.equal((await json('POST', '/api/recipes', { title: 'x', ingredients: [{ qty: 1 }] })).status, 400);
  assert.equal((await json('POST', '/api/recipes', { title: 'x', ingredients: 'Linsen' })).status, 400);
  assert.equal((await json('POST', '/api/recipes', { title: 'x', sourceUrl: 'javascript:alert(1)' })).status, 400);
  assert.equal((await json('POST', '/api/recipes', { title: 'x', cookedCount: 5 })).status, 400);

  const fav = await json('PATCH', `/api/recipes/${r.body.id}`, { favorite: true, notes: 'weniger Chili' });
  assert.equal(fav.body.favorite, true);
  const cooked = await json('POST', `/api/recipes/${r.body.id}/gekocht`, {});
  assert.equal(cooked.body.cookedCount, 1);
  assert.ok(cooked.body.lastCooked);

  // Wochenplan: 2 Vorschläge pro Abend, Platz doppelt belegt -> 409
  const m1 = await as(1, 'POST', '/api/meals', { day: '2026-11-09', slot: 1, recipeId: r.body.id });
  assert.equal(m1.status, 201);
  assert.equal(m1.body.createdBy, 1);
  assert.equal((await json('POST', '/api/meals', { day: '2026-11-09', slot: 2, title: 'Reste' })).status, 201);
  assert.equal((await json('POST', '/api/meals', { day: '2026-11-09', slot: 1, title: 'Pizza' })).status, 409);
  assert.equal((await json('POST', '/api/meals', { day: '2026-11-09', slot: 3, title: 'Pizza' })).status, 400);
  assert.equal((await json('POST', '/api/meals', { day: '2026-11-10' })).status, 400, 'Rezept oder Text nötig');

  // Wunschzettel
  const w = await as(2, 'POST', '/api/wishes', { name: 'rote Linsen', amount: '200 g', recipeId: r.body.id });
  assert.equal(w.body.addedBy, 2);

  // Rezept löschen: Wochenplan-Eintrag weg, Wunsch bleibt (ohne Rezept)
  await json('DELETE', `/api/recipes/${r.body.id}`);
  const { body } = await json('GET', '/api/state');
  assert.equal(body.meals.filter((m) => m.recipeId === r.body.id).length, 0);
  assert.equal(body.wishes.find((x) => x.id === w.body.id).recipeId, null);
});

test('Zuordnung Zutat -> Vorratsartikel merken', async () => {
  const l = await json('POST', '/api/links', { nameKey: 'nudeln', itemId: 21 });
  assert.equal(l.status, 201);
  assert.equal((await json('POST', '/api/links', { nameKey: 'nudeln', itemId: 20 })).status, 409);
  assert.equal((await json('PATCH', `/api/links/${l.body.id}`, { itemId: null })).body.itemId, null);
  assert.equal((await json('POST', '/api/links', { nameKey: 'x', itemId: 9999 })).status, 400);
});

test('Rezept per Link holen (schema.org/Recipe)', async () => {
  const page = `<html><head><script type="application/ld+json">{"@context":"https://schema.org","@graph":[
    {"@type":"WebPage"},{"@type":"Recipe","name":"Chili sin Carne &amp; Reis","recipeYield":["4","4 Portionen"],
    "totalTime":"PT1H5M","keywords":"vegan, Meal-Prep","recipeIngredient":["1 Zwiebel","400 g Kidneybohnen"],
    "recipeInstructions":[{"@type":"HowToSection","itemListElement":[{"@type":"HowToStep","text":"Zwiebel <b>anbraten</b>."}]},
    {"@type":"HowToStep","text":"Bohnen dazu."}]}]}</script></head><body></body></html>`;
  const site = http.createServer((req, res) => {
    if (req.url === '/weiter') { res.writeHead(302, { Location: '/rezept' }); return res.end(); }
    if (req.url === '/rezept') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(page); }
    res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<html>kein Rezept</html>');
  });
  await new Promise((r) => site.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${site.address().port}`;
  try {
    const ok = await json('POST', '/api/recipes/import', { url: `${base}/weiter` });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.title, 'Chili sin Carne & Reis');
    assert.deepEqual(ok.body.ingredients, ['1 Zwiebel', '400 g Kidneybohnen']);
    assert.deepEqual(ok.body.steps, ['Zwiebel anbraten.', 'Bohnen dazu.']);
    assert.equal(ok.body.minutes, 65);
    assert.equal(ok.body.servings, 4);
    assert.deepEqual(ok.body.tags, ['vegan', 'Meal-Prep']);
    assert.equal((await json('POST', '/api/recipes/import', { url: `${base}/nix` })).status, 422);
    assert.equal((await json('POST', '/api/recipes/import', { url: 'file:///etc/passwd' })).status, 400);
    assert.equal((await json('POST', '/api/recipes/import', { url: 'kein link' })).status, 400);
  } finally {
    site.close();
  }
});

test('Pinnwand: Notfall-Nummern sind schon angepinnt', async () => {
  const { body } = await json('GET', '/api/state');
  const notfall = body.notes.find((n) => n.kind === 'nummern');
  assert.equal(notfall.title, 'Notfälle');
  assert.ok(notfall.data.entries.some((e) => e.number === '112'));
  assert.deepEqual(body.folders.map((f) => f.name), ['Verträge', 'Wohnung']);
  assert.deepEqual(body.docs, []);
});

test('Filmabend: Merkliste, wer will, gesehen mit Popcorn-Bewertung', async () => {
  assert.deepEqual((await json('GET', '/api/state')).body.movies, []);
  const film = await as(1, 'POST', '/api/movies', { title: '  Das wandelnde Schloss ', service: 'netflix', wantedBy: [1, 2, 2] });
  assert.equal(film.status, 201);
  assert.equal(film.body.title, 'Das wandelnde Schloss');
  assert.equal(film.body.kind, 'film');
  assert.deepEqual(film.body.wantedBy, [1, 2]);
  assert.equal(film.body.addedBy, 1);
  assert.equal(film.body.seenOn, null);

  const serie = await as(2, 'POST', '/api/movies', { title: 'Dark', kind: 'serie', service: 'hbo', note: 'Tipp von Lea' });
  assert.equal(serie.body.kind, 'serie');

  // Prüfungen
  assert.equal((await json('POST', '/api/movies', { title: 'x', kind: 'doku' })).status, 400);
  assert.equal((await json('POST', '/api/movies', { title: 'x', service: 'youtube' })).status, 400);
  assert.equal((await json('POST', '/api/movies', { title: '' })).status, 400);
  assert.equal((await json('POST', '/api/movies', { title: 'x', wantedBy: ['1'] })).status, 400);
  assert.equal((await json('PATCH', `/api/movies/${film.body.id}`, { ratings: { 1: 6 } })).status, 400);
  assert.equal((await json('PATCH', `/api/movies/${film.body.id}`, { ratings: { abc: 3 } })).status, 400);
  assert.equal((await json('PATCH', `/api/movies/${film.body.id}`, { seenOn: 'gestern' })).status, 400);

  // Gesehen + bewertet
  const seen = await json('PATCH', `/api/movies/${film.body.id}`, { seenOn: '2026-11-07', ratings: { 1: 5, 2: 4 } });
  assert.equal(seen.status, 200);
  assert.equal(seen.body.seenOn, '2026-11-07');
  assert.deepEqual(seen.body.ratings, { 1: 5, 2: 4 });

  for (const m of [film, serie]) assert.equal((await json('DELETE', `/api/movies/${m.body.id}`)).status, 200);
  assert.deepEqual((await json('GET', '/api/state')).body.movies, []);
});

test('Pinnwand: WLAN, Nummern und Zettel anlegen und prüfen', async () => {
  const wlan = await as(1, 'POST', '/api/notes', {
    kind: 'wlan', title: 'WLAN für Gäste', secret: 'geheim;123', data: { ssid: 'Schloss', security: 'WPA', unbekannt: 1 },
  });
  assert.equal(wlan.status, 201);
  assert.equal(wlan.body.createdBy, 1);
  assert.deepEqual(wlan.body.data, { ssid: 'Schloss', security: 'WPA' });
  assert.equal(wlan.body.secret, 'geheim;123');

  const nums = await json('POST', '/api/notes', {
    kind: 'nummern', title: 'Haus', data: { entries: [{ name: 'Hausmeister', number: '+49 170 / 123-45' }] },
  });
  assert.equal(nums.status, 201);
  assert.equal((await json('PATCH', `/api/notes/${nums.body.id}`, { data: { entries: [{ name: 'x', number: 'javascript:alert(1)' }] } })).status, 400);
  assert.equal((await json('POST', '/api/notes', { kind: 'nummern', title: 'x', data: { entries: [{ name: 'x', number: '' }] } })).status, 400);
  assert.equal((await json('POST', '/api/notes', { kind: 'wlan', title: 'x', data: { security: 'offen' } })).status, 400);
  assert.equal((await json('POST', '/api/notes', { kind: 'brief', title: 'x' })).status, 400);
  assert.equal((await json('POST', '/api/notes', { kind: null, title: 'x' })).status, 400);
  assert.equal((await json('POST', '/api/notes', { kind: 'zettel' })).status, 400);

  const zettel = await json('POST', '/api/notes', { title: 'Fahrradkeller', body: 'Zeile 1\nZeile 2', secret: '4711' });
  assert.equal(zettel.body.kind, 'zettel');
  assert.equal(zettel.body.body, 'Zeile 1\nZeile 2');
  for (const n of [wlan, nums, zettel]) assert.equal((await json('DELETE', `/api/notes/${n.body.id}`)).status, 200);
});

test('Ordner: anlegen, PDF und Foto hochladen, ansehen, ändern, verschieben, löschen', async () => {
  assert.equal((await json('POST', '/api/notes', { kind: 'dokument', title: 'alt' })).status, 400, 'Dokument-Zettel gibt es nicht mehr');
  const folder = await json('POST', '/api/folders', { name: 'Versicherungen' });
  assert.equal(folder.status, 201);
  assert.equal((await json('POST', '/api/folders', { name: 'versicherungen' })).status, 409);
  const upload = (type, body, name = '', note = '', id = folder.body.id) => fetch(
    `${BASE}/api/folders/${id}/dateien?name=${encodeURIComponent(name)}&note=${encodeURIComponent(note)}`,
    { method: 'POST', headers: { 'Content-Type': type, 'X-Person': '2' }, body },
  );
  const fakePdf = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(200, 32)]);
  const r1 = await upload('application/pdf', fakePdf, 'C:\\Users\\Kait\\Haftpflicht Police.pdf', 'Kundennr. 4711');
  assert.equal(r1.status, 201);
  const pdf = await r1.json();
  assert.equal(pdf.name, 'Haftpflicht Police.pdf');
  assert.equal(pdf.note, 'Kundennr. 4711');
  assert.equal(pdf.type, 'pdf');
  assert.equal(pdf.addedBy, 2);
  assert.equal(pdf.folderId, folder.body.id);

  const r2 = await upload('image/jpeg', fakeJpeg, 'Seite 2.HEIC');
  assert.equal(r2.status, 201);
  const jpg = await r2.json();
  assert.equal(jpg.name, 'Seite 2.jpg');
  assert.equal(jpg.note, null);

  // Falscher Inhalt / falscher Typ / unbekannter Ordner
  assert.equal((await upload('application/pdf', fakeJpeg)).status, 400);
  assert.equal((await upload('text/html', '<script>alert(1)</script>'.repeat(10))).status, 415);
  assert.equal((await upload('application/pdf', fakePdf, 'x', '', 9999)).status, 404);
  assert.equal((await json('POST', '/api/docs', { name: 'x' })).status, 405);

  const get = await fetch(`${BASE}/api/docs/${pdf.id}/datei`);
  assert.equal(get.status, 200);
  assert.equal(get.headers.get('content-type'), 'application/pdf');
  assert.match(get.headers.get('content-disposition'), /^inline; filename="Haftpflicht Police.pdf"/);
  assert.deepEqual(Buffer.from(await get.arrayBuffer()), fakePdf);

  const renamed = await json('PATCH', `/api/docs/${pdf.id}`, { name: 'Police 2026.jpg', note: 'neu' });
  assert.equal(renamed.body.name, 'Police 2026.pdf', 'Endung bleibt passend');
  assert.equal(renamed.body.note, 'neu');

  // Ordner mit Dateien lässt sich nicht löschen
  assert.equal((await json('DELETE', `/api/folders/${folder.body.id}`)).status, 409);
  // verschieben
  const moved = await json('PATCH', `/api/docs/${jpg.id}`, { folderId: 1 });
  assert.equal(moved.body.folderId, 1);
  assert.equal((await json('PATCH', `/api/docs/${jpg.id}`, { folderId: 9999 })).status, 400);
  assert.equal((await json('PATCH', `/api/docs/${jpg.id}`, { folderId: null })).status, 400);

  const dir = path.join(dataDir, 'ordner');
  assert.equal(fs.readdirSync(dir).length, 2);
  for (const d of [pdf, jpg]) assert.equal((await json('DELETE', `/api/docs/${d.id}`)).status, 200);
  assert.equal((await fetch(`${BASE}/api/docs/${jpg.id}/datei`)).status, 404);
  assert.equal(fs.readdirSync(dir).length, 0);
  assert.equal((await json('DELETE', `/api/folders/${folder.body.id}`)).status, 200, 'leerer Ordner lässt sich löschen');
});

test('Kalender: zwei Personen verbinden, zusammengeführt, Doppelte einmal, Links bleiben geheim', async () => {
  const day = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10).replaceAll('-', '');
  const cal = (name, events) => ['BEGIN:VCALENDAR', `X-WR-CALNAME:${name}`, ...events.flatMap(([uid, start, title]) => ['BEGIN:VEVENT', `UID:${uid}`,
    `DTSTART;TZID=Europe/Berlin:${day}T${start}`, `DTEND;TZID=Europe/Berlin:${day}T${String(Number(start.slice(0, 2)) + 1).padStart(2, '0')}0000`,
    `SUMMARY:${title}`, 'END:VEVENT']), 'END:VCALENDAR'].join('\r\n');
  const files = {
    '/kait.ics': cal('Kait', [['k1', '100000', 'Friseur'], ['k2', '200000', 'Kino']]),
    '/schmaui.ics': cal('Schmaui', [['s1', '080000', 'Arzt'], ['s2', '200000', 'kino ']]),
  };
  const site = http.createServer((req, res) => {
    if (files[req.url]) { res.writeHead(200, { 'Content-Type': 'text/calendar' }); res.end(files[req.url]); return; }
    res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<html>keine Termine</html>');
  });
  await new Promise((r) => site.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${site.address().port}`;
  try {
    assert.equal((await json('GET', '/api/state')).body.calendar.connected, false);
    assert.equal((await json('POST', '/api/calendar/sync')).status, 409);
    assert.equal((await json('PUT', '/api/calendar/1', { url: 'kein link' })).status, 400);
    assert.equal((await json('PUT', '/api/calendar/99', { url: `${base}/kait.ics` })).status, 404);
    assert.equal((await json('PUT', '/api/calendar/1', { url: `${base}/seite` })).status, 422, 'HTML statt Kalender');
    assert.equal((await json('GET', '/api/state')).body.calendar.connected, false, 'falscher Link wird nicht gespeichert');

    const one = await json('PUT', '/api/calendar/1', { url: `${base}/kait.ics` });
    assert.equal(one.status, 200);
    assert.deepEqual(one.body.feeds.map((f) => [f.personId, f.name]), [[1, 'Kait']]);
    const two = await json('PUT', '/api/calendar/2', { url: `${base}/schmaui.ics` });
    assert.deepEqual(two.body.events.map((e) => [e.title, e.people]), [['Arzt', [2]], ['Friseur', [1]], ['Kino', [1, 2]]],
      'zusammengeführt, gleicher Termin nur einmal (mit beiden Personen)');
    const { body } = await json('GET', '/api/state');
    assert.equal(body.calendar.feeds.length, 2);
    assert.ok(!JSON.stringify(body).includes('.ics'), 'die geheimen Links kommen nie bei den Geräten an');

    // neuer Termin -> nach "jetzt aktualisieren" sichtbar
    files['/kait.ics'] = files['/kait.ics'].replace('END:VCALENDAR', ['BEGIN:VEVENT', 'UID:k3', `DTSTART;VALUE=DATE:${day}`, 'SUMMARY:Müll', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n'));
    const synced = await json('POST', '/api/calendar/sync');
    assert.equal(synced.body.events[0].title, 'Müll', 'ganztägig zuerst');

    // Server weg -> alte Termine bleiben, Fehler wird gemeldet
    site.close();
    const failed = await json('POST', '/api/calendar/sync');
    assert.equal(failed.body.events.length, 4);
    assert.ok(failed.body.feeds.every((f) => f.error));

    await json('PUT', '/api/calendar/2', { url: null });
    const off = await json('PUT', '/api/calendar/1', { url: null });
    assert.equal(off.body.connected, false);
  } finally {
    site.close();
  }
});

// ---------- Anmeldung (zweiter Server mit Passwort) ----------
test('Anmeldung mit Haushalts-Passwort', async () => {
  const port = PORT + 1;
  const base = `http://127.0.0.1:${port}`;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'haushalt-auth-'));
  const p = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/server.js'], {
    env: { ...process.env, PORT: String(port), DATA_DIR: dir, HAUSHALT_PASSWORT: 'geheim-geheim-123' },
    stdio: 'ignore',
  });
  try {
    for (let i = 0; i < 50; i++) {
      try { if ((await fetch(base + '/api/health')).ok) break; } catch { /* startet noch */ }
      await new Promise((r) => setTimeout(r, 100));
    }
    const req = (method, url, body, cookie) => fetch(base + url, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });

    assert.equal((await req('GET', '/api/state')).status, 401);
    assert.equal((await req('PATCH', '/api/items/1', { missing: true })).status, 401);
    assert.deepEqual(await (await req('GET', '/api/auth')).json(), { enabled: true, loggedIn: false });
    assert.equal((await req('GET', '/index.html')).status, 200, 'Seite selbst ist erreichbar');
    assert.equal((await req('POST', '/api/recipes/import', { url: 'https://example.org' })).status, 401, 'Import nur angemeldet');

    const wrong = await req('POST', '/api/login', { password: 'falsch' });
    assert.equal(wrong.status, 401);

    const ok = await req('POST', '/api/login', { password: 'geheim-geheim-123' });
    assert.equal(ok.status, 200);
    const setCookie = ok.headers.get('set-cookie');
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /SameSite=Strict/);
    const cookie = setCookie.split(';')[0];

    assert.equal((await req('GET', '/api/state', null, cookie)).status, 200);
    assert.equal((await req('GET', '/api/state', null, 'haushalt_session=' + 'x'.repeat(43))).status, 401);

    await req('POST', '/api/logout', {}, cookie);
    assert.equal((await req('GET', '/api/state', null, cookie)).status, 401, 'nach Abmelden gesperrt');

    // Bremse: nach 5 Fehlversuchen kommt 429 (erfolgreiche Anmeldung oben hat den Zähler geleert)
    const codes = [];
    for (let i = 0; i < 6; i++) codes.push((await req('POST', '/api/login', { password: 'nein' })).status);
    assert.deepEqual(codes, [401, 401, 401, 401, 401, 429]);
    assert.equal((await req('POST', '/api/login', { password: 'geheim-geheim-123' })).status, 429, 'auch richtiges PW gesperrt');
  } finally {
    p.kill();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Zu kurzes Passwort verhindert den Start', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'haushalt-kurz-'));
  const code = await new Promise((resolve) => {
    const p = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/server.js'], {
      env: { ...process.env, PORT: String(PORT + 2), DATA_DIR: dir, HAUSHALT_PASSWORT: 'kurz' },
      stdio: 'ignore',
    });
    p.on('exit', resolve);
  });
  fs.rmSync(dir, { recursive: true, force: true });
  assert.notEqual(code, 0);
});

test('Nachricht an die Tür: geht an die andere Person, getippt und/oder gemalt, nach 24 Std. weg', async () => {
  assert.deepEqual((await json('GET', '/api/state')).body.messages, []);
  const msg = await as(1, 'POST', '/api/messages', { body: '  Hab dich lieb ♡\nBis heute Abend ', paper: 'rosa' });
  assert.equal(msg.status, 201);
  assert.equal(msg.body.body, 'Hab dich lieb ♡\nBis heute Abend');
  assert.equal(msg.body.fromPerson, 1);
  assert.equal(msg.body.toPerson, 2);
  assert.equal(msg.body.paper, 'rosa');

  const drawing = [{ c: 'rot', p: [10, 10, 50, 60, 120, 80] }, { c: 'tinte', p: [200, 150] }];
  const drawn = await as(2, 'POST', '/api/messages', { drawing });
  assert.equal(drawn.status, 201);
  assert.equal(drawn.body.toPerson, 1);
  assert.equal(drawn.body.paper, 'gelb');
  assert.deepEqual(drawn.body.drawing, drawing);

  // Prüfungen
  assert.equal((await json('POST', '/api/messages', { body: 'Wer bin ich?' })).status, 400); // ohne Person
  assert.equal((await as(1, 'POST', '/api/messages', {})).status, 400);                     // leer
  assert.equal((await as(1, 'POST', '/api/messages', { body: '   ' })).status, 400);
  assert.equal((await as(1, 'POST', '/api/messages', { body: 'x', toPerson: 1 })).status, 400); // an sich selbst
  assert.equal((await as(1, 'POST', '/api/messages', { body: 'x', paper: 'lila' })).status, 400);
  assert.equal((await as(1, 'POST', '/api/messages', { body: 'x'.repeat(301) })).status, 400);
  assert.equal((await as(1, 'POST', '/api/messages', { drawing: [{ c: 'lila', p: [1, 1] }] })).status, 400);
  assert.equal((await as(1, 'POST', '/api/messages', { drawing: [{ c: 'rot', p: [1] }] })).status, 400);
  assert.equal((await as(1, 'POST', '/api/messages', { drawing: [{ c: 'rot', p: [401, 1] }] })).status, 400);
  assert.equal((await as(1, 'POST', '/api/messages', { drawing: [{ c: 'rot', p: [1.5, 1] }] })).status, 400);
  assert.equal((await as(1, 'POST', '/api/messages', { drawing: 'bild' })).status, 400);
  assert.equal((await as(1, 'PATCH', `/api/messages/${msg.body.id}`, { body: 'geändert' })).status, 405);
  assert.equal((await json('GET', '/api/state')).body.messages.length, 2);

  // Nach 24 Stunden ist eine Nachricht von selbst weg
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(path.join(dataDir, 'haushalt.db'));
  db.prepare('UPDATE door_messages SET created_at = ? WHERE id = ?')
    .run(new Date(Date.now() - 25 * 3600 * 1000).toISOString(), msg.body.id);
  db.close();
  await as(1, 'POST', '/api/messages', { body: 'noch eine' }); // ändert den Stand -> neu laden
  const left = (await json('GET', '/api/state')).body.messages;
  assert.deepEqual(left.map((m) => m.body ?? 'gemalt'), ['gemalt', 'noch eine']);

  for (const m of left) assert.equal((await json('DELETE', `/api/messages/${m.id}`)).status, 200);
  assert.deepEqual((await json('GET', '/api/state')).body.messages, []);
});

// ---------- Benachrichtigungen (Web-Push) ----------
// Ein nachgebauter Push-Dienst (wie Apples) nimmt die verschlüsselten Nachrichten an;
// der Test entschlüsselt sie wie ein Handy (RFC 8291) und prüft den Absender-Ausweis (VAPID).
import crypto from 'node:crypto';

function fakeDevice() {
  const ecdh = crypto.createECDH('prime256v1');
  const pub = ecdh.generateKeys();
  const auth = crypto.randomBytes(16);
  const decrypt = (body) => {
    const salt = body.subarray(0, 16);
    const idlen = body[20];
    const asPub = body.subarray(21, 21 + idlen);
    const ct = body.subarray(21 + idlen);
    const shared = ecdh.computeSecret(asPub);
    const ikm = Buffer.from(crypto.hkdfSync('sha256', shared, auth, Buffer.concat([Buffer.from('WebPush: info\0'), pub, asPub]), 32));
    const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
    const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
    const d = crypto.createDecipheriv('aes-128-gcm', cek, nonce);
    d.setAuthTag(ct.subarray(ct.length - 16));
    const plain = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
    assert.equal(plain[plain.length - 1], 2, 'Polsterung am Ende');
    return JSON.parse(plain.subarray(0, plain.length - 1).toString());
  };
  return { keys: { p256dh: pub.toString('base64url'), auth: auth.toString('base64url') }, decrypt };
}

function fakePushService(publicKey) {
  const inbox = [];
  let status = 201;
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      // Absender-Ausweis prüfen: JWT mit dem öffentlichen Schlüssel der App signiert
      const m = /^vapid t=([^,]+), k=(.+)$/.exec(req.headers.authorization || '');
      assert.ok(m, 'VAPID-Header fehlt');
      assert.equal(m[2], publicKey);
      const [h, c, sig] = m[1].split('.');
      const raw = Buffer.from(publicKey, 'base64url');
      const key = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: raw.subarray(1, 33).toString('base64url'), y: raw.subarray(33).toString('base64url') }, format: 'jwk' });
      assert.ok(crypto.verify('sha256', Buffer.from(`${h}.${c}`), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(sig, 'base64url')), 'Signatur gültig');
      assert.equal(JSON.parse(Buffer.from(c, 'base64url')).aud, `http://${req.headers.host}`);
      assert.equal(req.headers['content-encoding'], 'aes128gcm');
      inbox.push({ path: req.url, body: Buffer.concat(chunks) });
      res.writeHead(status);
      res.end();
    });
  });
  return { server, inbox, setStatus: (s) => { status = s; } };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 3000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { const v = fn(); if (v) return v; await sleep(50); }
  return fn();
}
const berlinTime = (offsetMin = 0) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  .format(new Date(Date.now() + offsetMin * 60000));

test('Benachrichtigungen: Liste gesammelt, Nachricht an der Tür, Ruhezeit, Morgens, Test, abgemeldetes Handy', async () => {
  const { publicKey } = (await json('GET', '/api/push/key')).body;
  assert.match(publicKey, /^[A-Za-z0-9_-]{87}$/);
  assert.equal((await json('GET', '/api/push/key')).body.publicKey, publicKey, 'Schlüssel bleibt gleich');

  const push = fakePushService(publicKey);
  await new Promise((r) => push.server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${push.server.address().port}`;
  const kaitPhone = fakeDevice();
  const endpoint = `${base}/kait`;
  const abo = (prefs) => as(1, 'POST', '/api/push/abo', { endpoint, keys: kaitPhone.keys, prefs });
  const received = () => push.inbox.map((m) => ({ path: m.path, ...kaitPhone.decrypt(m.body) }));
  try {
    // Prüfungen
    assert.equal((await as(1, 'POST', '/api/push/abo', { endpoint: 'https://boese.example/x', keys: kaitPhone.keys })).status, 400);
    assert.equal((await json('POST', '/api/push/abo', { endpoint, keys: kaitPhone.keys })).status, 400); // wer bin ich?
    assert.equal((await abo({ morning: '25:00' })).status, 400);
    const ok = await abo({ quiet: { on: false } });
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.body.prefs.kinds, { tuer: true, liste: true, aufgaben: true, termine: true });

    // Schmaui setzt zwei Sachen auf die Liste -> EINE Nachricht an Kait
    const { items } = (await json('GET', '/api/state')).body;
    const [a, b, c] = items.filter((i) => !i.missing);
    await as(2, 'PATCH', `/api/items/${a.id}`, { missing: true });
    await as(2, 'PATCH', `/api/items/${b.id}`, { missing: true });
    await as(2, 'PATCH', `/api/items/${c.id}`, { missing: true });
    await as(2, 'PATCH', `/api/items/${c.id}`, { missing: false }); // Rückgängig -> fällt wieder raus
    await as(1, 'POST', '/api/wishes', { name: 'Eigener Wunsch' });   // eigene Sachen: keine Nachricht
    await waitFor(() => push.inbox.length >= 1);
    await sleep(400);
    assert.equal(push.inbox.length, 1);
    const list = received()[0];
    assert.equal(list.path, '/kait');
    assert.equal(list.title, 'Schmaui hat 2 Sachen auf die Liste gesetzt');
    assert.equal(list.body, `${a.name}, ${b.name}`);
    assert.equal(list.url, '/#/liste');

    // Nachricht an die Tür kommt sofort
    await as(2, 'POST', '/api/messages', { body: 'Hab dich lieb' });
    await waitFor(() => push.inbox.length >= 2);
    assert.equal(received()[1].title, 'Schmaui hat dir eine Nachricht an die Tür gehängt ♡');
    assert.equal(received()[1].body, 'Hab dich lieb');

    // Ruhezeit: wartet …
    await abo({ quiet: { on: true, from: berlinTime(-60), to: berlinTime(60) } });
    await as(2, 'POST', '/api/messages', { drawing: [{ c: 'rot', p: [1, 1, 50, 50] }] });
    await sleep(600);
    assert.equal(push.inbox.length, 2, 'in der Ruhezeit kommt nichts');
    // … und kommt danach
    await abo({ quiet: { on: false } });
    await waitFor(() => push.inbox.length >= 3);
    assert.equal(received()[2].body, 'Hat dir etwas gemalt ✎');

    // Ausgeschaltete Art kommt nicht
    await abo({ kinds: { tuer: false }, quiet: { on: false } });
    await as(2, 'POST', '/api/messages', { body: 'still' });
    await sleep(500);
    assert.equal(push.inbox.length, 3);

    // Morgens: Aufgaben (für Kait oder egal wer), eine Nachricht pro Tag
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date());
    await as(2, 'POST', '/api/tasks', { title: 'Blumen gießen', due: day });
    await as(2, 'POST', '/api/tasks', { title: 'Nur für Schmaui', due: day, assigneeId: 2 });
    await abo({ quiet: { on: false }, morning: berlinTime(-1) });
    await waitFor(() => push.inbox.length >= 4);
    const morning = received()[3];
    assert.match(morning.title, /^Guten Morgen Kait ♡ Heute: \d+ Aufgaben?$/);
    assert.match(morning.body, /Blumen gießen/);
    assert.doesNotMatch(morning.body, /Nur für Schmaui/);
    await sleep(400);
    assert.equal(push.inbox.length, 4, 'nur einmal am Tag');

    // Test-Knopf
    assert.equal((await as(1, 'POST', '/api/push/test', { endpoint })).status, 200);
    await waitFor(() => push.inbox.length >= 5);
    assert.equal(received()[4].title, 'Hallo aus dem moving castle ♡');

    // Handy gibt es nicht mehr (410) -> Abo wird gelöscht
    push.setStatus(410);
    await as(1, 'POST', '/api/push/test', { endpoint });
    await sleep(500);
    assert.equal((await as(1, 'POST', '/api/push/test', { endpoint })).status, 404);
  } finally {
    push.server.close();
  }
});

test('Widget: Schlüssel, Auswahl, Daten nur mit Schlüssel', async () => {
  assert.equal((await json('GET', '/api/widget')).status, 400); // wer bin ich?
  assert.equal((await as(1, 'GET', '/api/widget')).body.hasKey, false);
  assert.equal((await as(1, 'PUT', '/api/widget', { show: ['liste'] })).status, 409);
  const { key } = (await as(1, 'POST', '/api/widget/schluessel')).body;
  assert.match(key, /^[A-Za-z0-9_-]{32}$/);
  const info = (await as(1, 'GET', '/api/widget')).body;
  assert.equal(info.hasKey, true);
  assert.deepEqual(info.show, ['liste', 'aufgaben', 'essen', 'tuer']);
  assert.equal((await as(1, 'PUT', '/api/widget', { show: ['kino'] })).status, 400);
  assert.deepEqual((await as(1, 'PUT', '/api/widget', { show: ['tuer', 'liste', 'termine'] })).body.show, ['tuer', 'liste', 'termine']);

  const data = (k) => fetch(BASE + '/api/widget/daten', { headers: k ? { 'X-Widget-Key': k } : {} })
    .then(async (r) => ({ status: r.status, body: await r.json() }));
  assert.equal((await data()).status, 401);
  assert.equal((await data('x'.repeat(32))).status, 401);
  const d = await data(key);
  assert.equal(d.status, 200);
  assert.equal(d.body.person, 'Kait');
  assert.deepEqual(d.body.show, ['tuer', 'liste', 'termine']);
  assert.ok(Array.isArray(d.body.liste));
  assert.ok(d.body.liste.some((i) => i.by === 'Schmaui'));
  assert.ok(Array.isArray(d.body.aufgaben));
  assert.equal(d.body.tuer.from, 'Schmaui');
  assert.equal(d.body.fridgeColor, 'mauve');

  // Neuer Schlüssel -> alter gilt nicht mehr; löschen -> keiner
  const { key: key2 } = (await as(1, 'POST', '/api/widget/schluessel')).body;
  assert.equal((await data(key)).status, 401);
  assert.equal((await data(key2)).status, 200);
  await as(1, 'DELETE', '/api/widget/schluessel');
  assert.equal((await data(key2)).status, 401);
});
