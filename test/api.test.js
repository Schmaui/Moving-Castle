// API-Tests: startet einen Server mit leerer Test-Datenbank und prüft alle Endpunkte.
// Aufruf: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

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
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir },
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
  assert.equal(body.categories.length, 8);
  assert.equal(body.items.length, 63);
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
