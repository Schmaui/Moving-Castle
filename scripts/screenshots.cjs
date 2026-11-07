// Startet NICHT selbst einen Server – erwartet ihn unter BASE (Standard http://localhost:8080).
// Macht Screenshots in Handy-, Tablet- und PC-Größe nach docs/screenshots/
// und klickt die wichtigsten Abläufe einmal durch (Selbsttest).
// Aufruf: node scripts/screenshots.cjs [http://localhost:8080]
const { chromium, devices } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');

const BASE = process.argv[2] || 'http://localhost:8080';
const OUT = path.join(__dirname, '..', 'docs', 'screenshots');
fs.mkdirSync(OUT, { recursive: true });

const api = (method, url, body) => fetch(BASE + url, {
  method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body),
}).then((r) => r.json());

function check(cond, msg) {
  if (!cond) throw new Error('FEHLER: ' + msg);
  console.log('  ✓', msg);
}

(async () => {
  // Beispiel: ein paar Dinge fehlen
  const { items } = await api('GET', '/api/state');
  for (const name of ['Tomaten (gehackt)', 'Kaffee', 'Milch', 'Butter', 'Zwiebeln', 'Penne', 'Zimt']) {
    const it = items.find((i) => i.name === name);
    await api('PATCH', `/api/items/${it.id}`, { missing: true });
  }

  const browser = await chromium.launch();
  const errors = [];
  const watch = (page) => {
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(e.message));
  };

  // ---------- Handy ----------
  console.log('Handy:');
  const phone = await browser.newContext({ ...devices['iPhone 13'] });
  let page = await phone.newPage(); watch(page);
  await page.goto(BASE + '/#/liste');
  await page.waitForSelector('.check-row');
  check(await page.locator('.nav__link[href="#/liste"] .badge').textContent() === '7', 'Badge zeigt 7');
  await page.screenshot({ path: path.join(OUT, 'handy-liste.jpg'), quality: 85 });

  await page.locator('.check-row', { hasText: 'Kaffee' }).click();
  await page.waitForSelector('.toast.is-visible');
  await page.waitForTimeout(300);
  check(await page.locator('.check-row', { hasText: 'Kaffee' }).count() === 0, 'Kaffee abgehakt, verschwindet');
  await page.screenshot({ path: path.join(OUT, 'handy-liste-rueckgaengig.jpg'), quality: 85 });
  await page.locator('.toast__action').click();
  await page.waitForSelector('.check-row:has-text("Kaffee")');
  check(true, 'Rückgängig bringt Kaffee zurück');

  await page.goto(BASE + '/#/vorrat');
  await page.waitForSelector('.chip');
  await page.locator('.chip', { hasText: 'Kidneybohnen' }).click();
  await page.waitForTimeout(400);
  check(await page.locator('.chip.is-missing', { hasText: 'Kidneybohnen' }).count() === 1, 'Chip antippen markiert als fehlt');
  await page.screenshot({ path: path.join(OUT, 'handy-vorrat.jpg'), quality: 85 });

  // Hinzufügen per ＋ und Enter
  await page.locator('button[aria-label="Artikel zu Kühlschrank hinzufügen"]').click();
  await page.keyboard.type('Hafermilch');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.chip:has-text("Hafermilch")');
  check(true, 'Artikel per Enter hinzugefügt');
  await page.locator('#view-vorrat .card', { hasText: 'Kühlschrank' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(OUT, 'handy-vorrat-hinzufuegen.jpg'), quality: 85 });

  // Löschmodus
  await page.locator('button', { hasText: 'Bearbeiten' }).click();
  await page.locator('.chip--delete', { hasText: 'Hafermilch' }).click();
  await page.waitForTimeout(400);
  check(await page.locator('.chip', { hasText: 'Hafermilch' }).count() === 0, 'Löschmodus entfernt Artikel');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(OUT, 'handy-vorrat-loeschmodus.jpg'), quality: 85 });
  await phone.close();

  // ---------- Handy dunkel ----------
  const dark = await browser.newContext({ ...devices['iPhone 13'], colorScheme: 'dark' });
  page = await dark.newPage(); watch(page);
  await page.goto(BASE + '/#/vorrat');
  await page.waitForSelector('.chip');
  await page.screenshot({ path: path.join(OUT, 'handy-vorrat-dunkel.jpg'), quality: 85 });
  await page.goto(BASE + '/#/liste');
  await page.waitForSelector('.check-row');
  await page.screenshot({ path: path.join(OUT, 'handy-liste-dunkel.jpg'), quality: 85 });
  await dark.close();

  // ---------- Tablet ----------
  const tablet = await browser.newContext({ viewport: { width: 900, height: 1100 }, deviceScaleFactor: 2 });
  page = await tablet.newPage(); watch(page);
  await page.goto(BASE + '/#/vorrat');
  await page.waitForSelector('.chip');
  await page.screenshot({ path: path.join(OUT, 'tablet-vorrat.jpg'), quality: 85 });
  await tablet.close();

  // ---------- PC ----------
  console.log('PC:');
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  page = await desktop.newPage(); watch(page);
  await page.goto(BASE + '/#/vorrat');
  await page.waitForSelector('.chip');
  check(await page.locator('#view-liste').isVisible(), 'Liste und Vorrat nebeneinander');
  // Hover-Effekt und Tastatur-Fokus sichtbar machen
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.locator('.chip', { hasText: 'Erdnussbutter' }).hover();
  await page.screenshot({ path: path.join(OUT, 'pc-vorrat-und-liste.jpg'), quality: 85 });

  // Synchronisation: Änderung über die API (= anderes Gerät) erscheint von selbst
  const { items: now } = await api('GET', '/api/state');
  const lebkuchen = now.find((i) => i.name === 'Lebkuchen');
  await api('PATCH', `/api/items/${lebkuchen.id}`, { missing: true });
  await page.waitForSelector('.check-row:has-text("Lebkuchen")', { timeout: 8000 });
  check(true, 'Änderung von anderem Gerät erscheint automatisch');

  const desktopDark = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: 'dark' });
  page = await desktopDark.newPage(); watch(page);
  await page.goto(BASE + '/#/liste');
  await page.waitForSelector('.chip');
  await page.screenshot({ path: path.join(OUT, 'pc-dunkel.jpg'), quality: 85 });

  await browser.close();
  check(errors.length === 0, `keine Fehler in der Browser-Konsole ${errors.length ? JSON.stringify(errors) : ''}`);
  console.log('Screenshots in', OUT);
})().catch((e) => { console.error(e); process.exit(1); });
