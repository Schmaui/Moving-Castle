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

// person = wer die Änderung macht (1 = Kait, 2 = Schmaui), wie ein Handy es mitschickt
const api = (method, url, body, person) => fetch(BASE + url, {
  method,
  headers: { 'Content-Type': 'application/json', ...(person ? { 'X-Person': String(person) } : {}) },
  body: body && JSON.stringify(body),
}).then((r) => r.json());

// Datum in N Tagen als "JJJJ-MM-TT" (lokale Zeit)
const day = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function check(cond, msg) {
  if (!cond) throw new Error('FEHLER: ' + msg);
  console.log('  ✓', msg);
}

(async () => {
  // Beispiel: ein paar Dinge fehlen
  const { items } = await api('GET', '/api/state');
  for (const [i, name] of ['Tomaten (gehackt)', 'Kaffee', 'Milch', 'Butter', 'Zwiebeln', 'Penne', 'Zimt'].entries()) {
    const it = items.find((x) => x.name === name);
    await api('PATCH', `/api/items/${it.id}`, { missing: true }, (i % 2) + 1);
  }
  // … und ein paar sind gerade gekauft worden
  for (const [name, by] of [['Nussmix', 2], ['Fusilli', 1]]) {
    const it = items.find((x) => x.name === name);
    await api('PATCH', `/api/items/${it.id}`, { missing: true }, by);
    await api('PATCH', `/api/items/${it.id}`, { missing: false }, by);
  }

  // Beispiel-Aufgaben
  await api('POST', '/api/tasks', { title: 'Altglas wegbringen', due: day(0), assigneeId: 2 }, 1);
  await api('POST', '/api/tasks', { title: 'Bad putzen', due: day(-2), repeat: 'woechentlich' }, 2);
  await api('POST', '/api/tasks', { title: 'Geschenk für Mama besorgen', due: day(5), assigneeId: 1, note: 'Vielleicht ein Buch vom Laden am Markt?' }, 2);
  await api('POST', '/api/tasks', { title: 'Pflanzen umtopfen', due: day(2), repeat: 'monatlich' }, 1);
  await api('POST', '/api/tasks', { title: 'Fahrradlicht reparieren' }, 1);
  const muell = await api('POST', '/api/tasks', { title: 'Müll rausbringen', due: day(0) }, 1);
  await api('POST', `/api/tasks/${muell.id}/erledigt`, {}, 2);

  const browser = await chromium.launch();
  const errors = [];
  const watch = (page) => {
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(e.message));
  };
  // Neues "Gerät", auf dem schon jemand ausgewählt ist (sonst kommt erst "Wer bist du?")
  const device = async (options, person = 2) => {
    const ctx = await browser.newContext(options);
    await ctx.addInitScript((id) => { try { localStorage.setItem('haushalt_person', String(id)); } catch {} }, person);
    return ctx;
  };

  // ---------- Handy ----------
  console.log('Handy:');
  const phone = await browser.newContext({ ...devices['iPhone 13'] });
  let page = await phone.newPage(); watch(page);
  await page.goto(BASE + '/#/liste');
  await page.waitForSelector('.who');
  check(true, '„Wer bist du?“ beim ersten Öffnen');
  await page.screenshot({ path: path.join(OUT, 'handy-wer-bist-du.jpg'), quality: 85 });
  await page.locator('.who__person', { hasText: 'Kait' }).click();
  await page.waitForSelector('.who-screen', { state: 'hidden' });
  await page.reload();
  await page.waitForSelector('.check-row');
  check(await page.locator('.who-screen').isHidden(), 'Gerät merkt sich die Person');
  check(await page.locator('.check-row__who').count() === 7, 'Liste zeigt, wer etwas draufgesetzt hat');
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
  await page.locator('button', { hasText: 'Fertig' }).click();

  // Aufgaben
  await page.goto(BASE + '/#/aufgaben');
  await page.waitForSelector('#view-aufgaben .task');
  check(await page.locator('.card--done', { hasText: 'Müll rausbringen' }).count() === 1, 'Erledigt-Verlauf zeigt Müll rausbringen');
  await page.screenshot({ path: path.join(OUT, 'handy-aufgaben.jpg'), quality: 85 });
  await page.locator('[data-focus-key="task-new"]').fill('Fenster putzen');
  await page.locator('.task-new__more').click();
  await page.locator('.pill', { hasText: 'Wochenende' }).click();
  await page.locator('.task-new .pill', { hasText: 'Schmaui' }).click();
  await page.locator('[data-focus-key="task-new"]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(OUT, 'handy-aufgabe-neu.jpg'), quality: 85 });
  await page.locator('button', { hasText: 'Eintragen' }).click();
  await page.waitForSelector('#view-aufgaben .task:has-text("Fenster putzen")');
  check(true, 'Aufgabe mit Datum und Person eingetragen');
  await page.locator('#view-aufgaben .task', { hasText: 'Altglas wegbringen' }).locator('.task__check').click();
  await page.waitForSelector('.card--done .task:has-text("Altglas wegbringen")');
  check(await page.locator('.card--done .task', { hasText: 'Altglas wegbringen' }).locator('.byline').textContent().then((t) => t.includes('Kait')),
    'Abgehakt – im Verlauf steht, dass Kait es erledigt hat');
  await page.locator('.toast__action').click();
  await page.waitForSelector('#view-aufgaben .task:not(.task--done):has-text("Altglas wegbringen")');
  check(true, 'Rückgängig holt die Aufgabe zurück');
  await page.locator('#view-aufgaben .task', { hasText: 'Bad putzen' }).locator('.task__check').click();
  await page.waitForSelector('.toast.is-visible:has-text("Nächstes Mal")');
  check(await page.locator('#view-aufgaben .task:not(.task--done)', { hasText: 'Bad putzen' }).count() === 1, 'Wiederholung legt die nächste Aufgabe an');

  await page.goto(BASE + '/#/vorrat');
  await page.waitForSelector('#view-vorrat .card--due');
  check(true, 'Zettel „Heute dran“ hängt im Vorrat');
  await page.goto(BASE + '/#/einstellungen');
  await page.waitForSelector('.person-row');
  await page.screenshot({ path: path.join(OUT, 'handy-einstellungen.jpg'), quality: 85, fullPage: true });
  await phone.close();

  // ---------- Handy dunkel ----------
  const dark = await device({ ...devices['iPhone 13'], colorScheme: 'dark' });
  page = await dark.newPage(); watch(page);
  await page.goto(BASE + '/#/vorrat');
  await page.waitForSelector('.chip');
  await page.screenshot({ path: path.join(OUT, 'handy-vorrat-dunkel.jpg'), quality: 85 });
  await page.goto(BASE + '/#/liste');
  await page.waitForSelector('.check-row');
  await page.screenshot({ path: path.join(OUT, 'handy-liste-dunkel.jpg'), quality: 85 });
  await page.goto(BASE + '/#/aufgaben');
  await page.waitForSelector('#view-aufgaben .task');
  await page.screenshot({ path: path.join(OUT, 'handy-aufgaben-dunkel.jpg'), quality: 85 });
  await page.goto(BASE + '/#/einstellungen');
  await page.waitForSelector('.person-row');
  await page.screenshot({ path: path.join(OUT, 'handy-einstellungen-dunkel.jpg'), quality: 85 });
  await dark.close();

  // ---------- Tablet ----------
  const tablet = await device({ viewport: { width: 900, height: 1100 }, deviceScaleFactor: 2 });
  page = await tablet.newPage(); watch(page);
  await page.goto(BASE + '/#/vorrat');
  await page.waitForSelector('.chip');
  await page.screenshot({ path: path.join(OUT, 'tablet-vorrat.jpg'), quality: 85 });
  await tablet.close();

  // ---------- PC ----------
  console.log('PC:');
  const desktop = await device({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
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
  await page.goto(BASE + '/#/aufgaben');
  await page.waitForSelector('#view-aufgaben .task');
  await page.mouse.move(0, 0);
  await page.screenshot({ path: path.join(OUT, 'pc-aufgaben.jpg'), quality: 85 });

  const desktopDark = await device({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: 'dark' });
  page = await desktopDark.newPage(); watch(page);
  await page.goto(BASE + '/#/liste');
  await page.waitForSelector('.chip');
  await page.screenshot({ path: path.join(OUT, 'pc-dunkel.jpg'), quality: 85 });
  await page.goto(BASE + '/#/aufgaben');
  await page.waitForSelector('#view-aufgaben .task');
  await page.screenshot({ path: path.join(OUT, 'pc-aufgaben-dunkel.jpg'), quality: 85 });

  await browser.close();
  check(errors.length === 0, `keine Fehler in der Browser-Konsole ${errors.length ? JSON.stringify(errors) : ''}`);
  console.log('Screenshots in', OUT);
})().catch((e) => { console.error(e); process.exit(1); });
