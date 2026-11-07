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
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, IMPORT_ALLOW_PRIVATE: '1' },
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
  assert.equal(body.categories.length, 10);
  assert.equal(body.items.length, 74);
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
