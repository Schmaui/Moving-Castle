// Startet NICHT selbst einen Server – erwartet ihn unter BASE (Standard http://localhost:8080).
// Macht Screenshots in Handy-, Tablet- und PC-Größe nach docs/screenshots/
// und klickt die wichtigsten Abläufe einmal durch (Selbsttest).
// Aufruf: node scripts/screenshots.cjs [http://localhost:8080]
// Der Server muss mit IMPORT_ALLOW_PRIVATE=1 laufen (Test-Kalender kommt von diesem Rechner).
const { chromium, devices } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

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

  // Mengen: Kokosmilch ist da, Tomatenmark ist alle (-> steht von selbst auf der Liste)
  const itemByName = (n) => items.find((x) => x.name === n);
  await api('PATCH', `/api/items/${itemByName('Kokosmilch').id}`, { quantity: 2, minQty: 1, unit: 'Dose' }, 2);
  await api('PATCH', `/api/items/${itemByName('Tomatenmark').id}`, { quantity: 0, minQty: 1, unit: 'Tube' }, 2);
  await api('PATCH', `/api/items/${itemByName('Reis').id}`, { quantity: 1000, minQty: 500, unit: 'g' }, 1);

  // Beispiel-Rezepte (Zutaten wie in der App aus Text zerlegt)
  const { parseIngredient } = await import('../public/js/recipes.js');
  const recipe = (title, minutes, tags, favorite, lines, steps) => api('POST', '/api/recipes', {
    title, minutes, tags, favorite, ingredients: lines.map(parseIngredient), steps: steps.join('\n'),
  }, 1);
  const curry = await recipe('Rotes Linsen-Curry', 35, ['schnell', 'vegan'], true,
    ['1 Zwiebel', '2 Knoblauchzehen', '1 EL Olivenöl', '200 g rote Linsen', '1 Dose Kokosmilch', '1 Dose gehackte Tomaten', '2 TL Curry', '200 g Reis'],
    ['Zwiebel und Knoblauch hacken, in Olivenöl anbraten.', 'Linsen, Kokosmilch, Tomaten und Curry dazu, 20 Min. köcheln.', 'Mit Reis servieren.']);
  const chili = await recipe('Chili sin Carne', 50, ['Meal-Prep'], false,
    ['1 Zwiebel', '1 Dose Kidneybohnen', '1 Dose Mais', '150 g Soja-Granulat', '2 EL Tomatenmark', '1 TL Paprika geräuchert', '1 TL Chili'],
    ['Soja-Granulat in Brühe einweichen.', 'Zwiebel anbraten, alles dazu und 30 Min. köcheln.']);
  const pancakes = await recipe('Fluffige Pfannkuchen', 20, ['süß'], true,
    ['250 g Mehl', '2 EL Zucker', '1 Pck Backpulver', '400 ml Milch', 'Ahornsirup'],
    ['Alles verrühren.', 'In der Pfanne goldbraun backen.']);
  const ofen = await recipe('Ofengemüse mit Tofu', 40, ['Meal-Prep'], false,
    ['500 g Kartoffeln', '1 Paprika', '200 g Räuchertofu', '2 EL Olivenöl', '1 TL Kräuter der Provence', '1 Zucchini'],
    ['Gemüse schneiden, mit Öl und Kräutern mischen.', '30 Min. bei 200 °C backen.']);
  await api('POST', '/api/meals', { day: day(0), slot: 1, recipeId: curry.id }, 1);
  await api('POST', '/api/meals', { day: day(0), slot: 2, recipeId: ofen.id }, 2);
  await api('POST', '/api/meals', { day: day(1), slot: 1, recipeId: chili.id }, 2);
  await api('POST', '/api/meals', { day: day(2), slot: 1, title: 'Reste' }, 1);
  await api('POST', '/api/meals', { day: day(3), slot: 1, recipeId: pancakes.id }, 1);

  // Beispiel-Aufgaben
  await api('POST', '/api/tasks', { title: 'Altglas wegbringen', due: day(0), assigneeId: 2 }, 1);
  await api('POST', '/api/tasks', { title: 'Bad putzen', due: day(-2), repeat: 'woechentlich' }, 2);
  await api('POST', '/api/tasks', { title: 'Geschenk für Mama besorgen', due: day(5), assigneeId: 1, note: 'Vielleicht ein Buch vom Laden am Markt?' }, 2);
  await api('POST', '/api/tasks', { title: 'Pflanzen umtopfen', due: day(2), repeat: 'monatlich' }, 1);
  await api('POST', '/api/tasks', { title: 'Fahrradlicht reparieren' }, 1);
  const muell = await api('POST', '/api/tasks', { title: 'Müll rausbringen', due: day(0) }, 1);
  await api('POST', `/api/tasks/${muell.id}/erledigt`, {}, 2);

  // Pinnwand: Nummern, Notizen, Ordner mit Dateien
  await api('POST', '/api/notes', { kind: 'nummern', title: 'Haus & Vermieter', data: { entries: [
    { name: 'Hausmeister Herr Kowalski', number: '0170 1234567' }, { name: 'Hausverwaltung', number: '+49 30 987654-0' },
  ] } }, 1);
  await api('POST', '/api/notes', { kind: 'zettel', title: 'Fahrradkeller', body: 'Schlüssel hängt am Brett im Flur.\nLicht: Schalter links hinter der Tür.', secret: '4711' }, 2);
  await api('POST', '/api/notes', { kind: 'zettel', title: 'Pflanzen gießen', body: 'Monstera 1× pro Woche,\nKakteen nur alle 3 Wochen!' }, 1);
  const { folders } = await api('GET', '/api/state');
  const vertraege = folders.find((f) => f.name === 'Verträge');
  const wohnung = folders.find((f) => f.name === 'Wohnung');
  const fakePdf = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 200 200]/Parent 2 0 R>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
  const upload = (folder, type, body, name, note = '', person = 1) => fetch(
    `${BASE}/api/folders/${folder.id}/dateien?name=${encodeURIComponent(name)}&note=${encodeURIComponent(note)}`,
    { method: 'POST', headers: { 'Content-Type': type, 'X-Person': String(person) }, body },
  ).then((r) => r.json());
  await upload(wohnung, 'application/pdf', fakePdf, 'Mietvertrag', 'Kaution 2.400 € – Kündigungsfrist 3 Monate', 2);
  await upload(vertraege, 'application/pdf', fakePdf, 'Haftpflicht Police', 'Kundennr. HV-4471-22');
  await upload(vertraege, 'application/pdf', fakePdf, 'Internet (Glasfaser)', 'Mindestlaufzeit bis 3/2027', 2);

  // Test-Kalender (so wie ihn Apple als "Öffentlichen Kalender" liefert), Termine rund um heute
  const ical = (n) => day(n).replaceAll('-', '');
  const monday = (() => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return Math.round((d - new Date()) / 86400000); })();
  const head = (name) => ['BEGIN:VCALENDAR', 'VERSION:2.0', `X-WR-CALNAME:${name}`, 'X-WR-TIMEZONE:Europe/Berlin'];
  const kino = ['BEGIN:VEVENT', 'UID:kino', `DTSTART;TZID=Europe/Berlin:${ical(monday + 2)}T200000`, `DTEND;TZID=Europe/Berlin:${ical(monday + 2)}T223000`, 'SUMMARY:Kino mit Lea & Tom', 'END:VEVENT'];
  const CALS = {
    '/kait.ics': [...head('Kait'),
      'BEGIN:VEVENT', 'UID:t1', `DTSTART;TZID=Europe/Berlin:${ical(0)}T093000`, `DTEND;TZID=Europe/Berlin:${ical(0)}T103000`,
      'SUMMARY:Zahnarzt', 'LOCATION:Praxis Dr. Müller\\, Hauptstraße 5', 'DESCRIPTION:Versichertenkarte mitnehmen', 'END:VEVENT',
      'BEGIN:VEVENT', 'UID:t5', `DTSTART;TZID=Europe/Berlin:${ical(monday + 1)}T123000`, `DTEND;TZID=Europe/Berlin:${ical(monday + 1)}T133000`, 'SUMMARY:Mittag mit Mama', 'END:VEVENT',
      ...kino, 'END:VCALENDAR'].join('\r\n'),
    '/schmaui.ics': [...head('Schmaui'),
      'BEGIN:VEVENT', 'UID:t2', `DTSTART;VALUE=DATE:${ical(monday + 5)}`, `DTEND;VALUE=DATE:${ical(monday + 7)}`, 'SUMMARY:Wochenende bei Oma', 'END:VEVENT',
      'BEGIN:VEVENT', 'UID:t3', `DTSTART;TZID=Europe/Berlin:${ical(monday)}T190000`, `DTEND;TZID=Europe/Berlin:${ical(monday)}T200000`,
      'RRULE:FREQ=WEEKLY;BYDAY=MO,TH', 'SUMMARY:Yoga', 'LOCATION:Studio am Park', 'END:VEVENT',
      'BEGIN:VEVENT', 'UID:t6', `DTSTART;VALUE=DATE:${ical(monday + 10)}`, 'RRULE:FREQ=YEARLY', 'SUMMARY:Geburtstag Oma', 'END:VEVENT',
      'BEGIN:VEVENT', 'UID:t7', `DTSTART;TZID=Europe/Berlin:${ical(monday + 15)}T080000`, `DTEND;TZID=Europe/Berlin:${ical(monday + 15)}T090000`, 'SUMMARY:Handwerker Heizung', 'END:VEVENT',
      ...kino, 'END:VCALENDAR'].join('\r\n'),
  };
  const calServer = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/calendar' }); res.end(CALS[req.url] || ''); });
  await new Promise((r) => calServer.listen(0, '127.0.0.1', r));
  const calBase = `http://127.0.0.1:${calServer.address().port}`;

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
  check(await page.locator('#view-liste .check-row__who').count() === 8, 'Liste zeigt, wer etwas draufgesetzt hat');
  check(await page.locator('.nav__link[href="#/liste"] .badge').textContent() === '8', 'Badge zeigt 8 (Tomatenmark ist unter der Mindestmenge)');
  check(await page.locator('#view-liste .buy-amount', { hasText: 'Tube' }).count() === 1, 'Artikel mit Menge: Einkaufsmenge wählbar');
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
  await page.locator('#view-vorrat button', { hasText: 'Bearbeiten' }).click();
  await page.locator('.chip--delete', { hasText: 'Hafermilch' }).click();
  await page.locator('[data-focus-key="edit-delete"]').click();
  await page.waitForTimeout(400);
  check(await page.locator('.chip', { hasText: 'Hafermilch' }).count() === 0, 'Bearbeiten: Artikel löschen');
  await page.locator('.chip--delete', { hasText: 'Kidneybohnen' }).click();
  await page.locator('[data-focus-key="edit-quantity"]').fill('1');
  await page.locator('[data-focus-key="edit-minQty"]').fill('2');
  await page.locator('[data-focus-key="edit-unit"]').fill('Dose');
  await page.locator('.item-editor').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(OUT, 'handy-vorrat-menge.jpg'), quality: 85 });
  await page.locator('.item-editor button[type="submit"]').click();
  await page.waitForSelector('#view-vorrat .chip:has-text("Kidneybohnen") .chip__qty');
  check(true, 'Bearbeiten: Menge und Mindestmenge gespeichert');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(OUT, 'handy-vorrat-loeschmodus.jpg'), quality: 85 });
  await page.locator('#view-vorrat button', { hasText: 'Fertig' }).click();

  // Küche → Haushalt: Zahnpasta und Spülmittel fehlen
  check(await page.locator('.nav__link').count() === 5, 'Leiste hat 5 Knöpfe');
  check(await page.locator('.nav__link[href="#/vorrat"]').getAttribute('aria-current') === 'page', 'Knopf „Küche“ leuchtet im Vorrat');
  await page.locator('#view-vorrat .kitchen-tabs__tab', { hasText: 'Haushalt' }).click();
  await page.waitForSelector('#view-haushalt .chip');
  check(await page.locator('.nav__link[href="#/vorrat"]').getAttribute('aria-current') === 'page', 'Knopf „Küche“ leuchtet auch im Haushalt');
  await page.locator('#view-haushalt .chip', { hasText: 'Zahnpasta' }).click();
  await page.locator('#view-haushalt .chip', { hasText: 'Spülmittel' }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, 'handy-haushalt.jpg'), quality: 85 });
  await page.goto(BASE + '/#/liste');
  await page.waitForSelector('#view-liste .list-section');
  check(await page.locator('#view-liste .list-section ~ .cards .check-row', { hasText: 'Zahnpasta' }).count() === 1, 'Liste: Zahnpasta steht im Abschnitt „Haushalt“');
  await page.locator('#view-liste .list-section').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(OUT, 'handy-liste-haushalt.jpg'), quality: 85 });
  await page.goto(BASE + '/#/vorrat');
  await page.waitForSelector('#view-vorrat .chip');

  // Aufgaben
  // Planer → Kalender: erst verbinden (wie in der App), dann Woche und Monat
  await page.goto(BASE + '/#/kalender');
  await page.waitForSelector('#view-kalender .cal-setup');
  await page.waitForFunction(() => !document.querySelector('.toast'), null, { timeout: 10000 });
  check(await page.locator('.nav__link', { hasText: 'Planer' }).getAttribute('aria-current') === 'page', 'Knopf „Planer“ leuchtet im Kalender');
  await page.screenshot({ path: path.join(OUT, 'handy-kalender-verbinden.jpg'), quality: 85, fullPage: true });
  await page.locator('#view-kalender [data-focus-key="cal-link-1"]').fill(`${calBase}/kait.ics`);
  await page.locator('#view-kalender [data-focus-key="cal-link-1"]').press('Enter');
  await page.waitForSelector('#view-kalender .cal-week');
  check(await page.locator('#view-kalender .cal-day.is-today .cal-event', { hasText: 'Zahnarzt' }).count() === 1, 'Kaits Kalender verbunden: heutiger Termin steht in der Woche');
  await page.locator('#view-kalender [data-focus-key="cal-manage"]', { hasText: 'Schmaui' }).click();
  await page.locator('#view-kalender [data-focus-key="cal-link-2"]').fill(`${calBase}/schmaui.ics`);
  await page.locator('#view-kalender [data-focus-key="cal-link-2"]').press('Enter');
  await page.waitForSelector('#view-kalender .cal-event:has-text("Yoga")');
  check(await page.locator('#view-kalender .cal-event', { hasText: 'Kino' }).count() === 1, 'Zweiter Kalender dazu – gemeinsamer Termin „Kino“ nur einmal');
  check(await page.locator('#view-kalender .cal-event', { hasText: 'Kino' }).locator('.avatar').count() === 2, '… mit beiden Profilbildern');
  await page.locator('#view-kalender .cal-setup').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(OUT, 'handy-kalender-verwalten.jpg'), quality: 85 });
  await page.locator('#view-kalender [data-focus-key="cal-manage"]').click();
  check(await page.locator('#view-kalender .cal-event', { hasText: 'Yoga' }).count() === 2, 'Wiederholung (Mo + Do) erscheint zweimal');
  await page.waitForFunction(() => !document.querySelector('.toast'), null, { timeout: 10000 });
  await page.screenshot({ path: path.join(OUT, 'handy-kalender-woche.jpg'), quality: 85 });
  await page.screenshot({ path: path.join(OUT, 'handy-kalender-woche-ganz.jpg'), quality: 85, fullPage: true });
  await page.locator('#view-kalender .cal-event', { hasText: 'Zahnarzt' }).click();
  await page.waitForSelector('.cal-sheet');
  check(await page.locator('.cal-sheet', { hasText: 'Hauptstraße 5' }).count() === 1, 'Termin antippen zeigt Ort und Notiz');
  await page.screenshot({ path: path.join(OUT, 'handy-kalender-termin.jpg'), quality: 85 });
  await page.keyboard.press('Escape');
  await page.locator('#view-kalender .segmented__item', { hasText: 'Monat' }).click();
  await page.waitForSelector('#view-kalender .cal-month');
  await page.locator(`#view-kalender .cal-cell[data-focus-key="cell-${day(monday + 2)}"]`).click();
  await page.waitForSelector('#view-kalender .cal-day--selected .cal-event:has-text("Kino")');
  check(true, 'Monat: Tag antippen zeigt seine Termine');
  await page.screenshot({ path: path.join(OUT, 'handy-kalender-monat.jpg'), quality: 85, fullPage: true });
  await page.locator('#view-kalender .kitchen-tabs__tab', { hasText: 'Aufgaben' }).click();
  await page.waitForSelector('#view-aufgaben .task');
  check(await page.locator('.nav__link', { hasText: 'Planer' }).getAttribute('aria-current') === 'page', 'Knopf „Planer“ leuchtet auch bei den Aufgaben');

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
  check(await page.locator('#view-vorrat .card--due', { hasText: 'Heute gibt’s' }).count() === 1, 'Zettel „Heute dran“ und „Heute gibt’s“ hängen im Vorrat');

  // Kochen: Wochenplan, Rezept, Fehlendes einkaufen, Gekocht
  await page.goto(BASE + '/#/kochen');
  await page.waitForSelector('#view-kochen .day-card.is-today');
  await page.waitForFunction(() => !document.querySelector('.toast'), null, { timeout: 10000 }); // Hinweis weg
  await page.screenshot({ path: path.join(OUT, 'handy-kochen-woche.jpg'), quality: 85, fullPage: true });
  await page.locator('#view-kochen .day-card.is-today .meal', { hasText: 'Linsen-Curry' }).locator('.pill', { hasText: 'Das gibt’s' }).click();
  await page.waitForSelector('#view-kochen .day-card.is-today .meal.is-other');
  check(true, '„Das gibt’s“ wählt einen der zwei Vorschläge');
  await page.locator('#view-kochen .day-card.is-today .pill--cook').click();
  await page.waitForSelector('.sheet .cook-row');
  await page.screenshot({ path: path.join(OUT, 'handy-kochen-gekocht.jpg'), quality: 85 });
  await page.locator('[data-focus-key="cook-ok"]').click();
  await page.waitForSelector('#view-kochen .day-card.is-today .meal__done');
  const { items: afterCook } = await api('GET', '/api/state');
  check(afterCook.find((i) => i.name === 'Kokosmilch').quantity === 1, 'Gekocht: Kokosmilch 2 → 1 Dose abgezogen');

  await page.goto(BASE + '/#/kochen/rezepte');
  await page.waitForSelector('#view-kochen .recipe-card');
  await page.screenshot({ path: path.join(OUT, 'handy-rezepte.jpg'), quality: 85 });
  await page.locator('#view-kochen .recipe-card__title', { hasText: 'Linsen-Curry' }).click();
  await page.waitForSelector('#view-kochen .ing-list');
  check(await page.locator('#view-kochen .ing--extra', { hasText: 'rote Linsen' }).count() === 1, 'Rezept: Linsen sind nicht im Vorrat → Wunschzettel');
  check(await page.locator('#view-kochen .ing', { hasText: 'Knoblauchzehen' }).locator('select').inputValue().then(async (v) =>
    v === 'auto' && (await page.locator('#view-kochen .ing', { hasText: 'Knoblauchzehen' }).textContent()).includes('Knoblauch')), 'Rezept: Knoblauchzehen → Knoblauch (automatisch)');
  await page.screenshot({ path: path.join(OUT, 'handy-rezept.jpg'), quality: 85, fullPage: true });
  await page.locator('[data-focus-key="shop"]').click();
  await page.waitForSelector('.toast.is-visible:has-text("Wunschzettel")');
  await page.goto(BASE + '/#/liste');
  await page.waitForSelector('#view-liste .card--wish .check-row:has-text("rote Linsen")');
  check(true, 'Fehlendes einkaufen: Linsen stehen auf dem Wunschzettel');
  await page.locator('#view-liste .card--wish').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(OUT, 'handy-wunschzettel.jpg'), quality: 85 });

  await page.goto(BASE + '/#/kochen/neu');
  await page.locator('[data-focus-key="form-title"]').fill('Overnight Oats');
  await page.locator('[data-focus-key="form-ingredients"]').fill('80 g Haferflocken\n150 ml Hafermilch\n1 EL Ahornsirup');
  await page.locator('[data-focus-key="form-steps"]').fill('Alles mischen und über Nacht kalt stellen.');
  await page.screenshot({ path: path.join(OUT, 'handy-rezept-neu.jpg'), quality: 85 });
  await page.locator('[data-focus-key="form-save"]').click();
  await page.waitForSelector('#view-kochen .ing-list');
  check(await page.locator('#view-kochen .ing').count() === 3, 'Neues Rezept selbst geschrieben und gespeichert');
  await page.goto(BASE + '/#/einstellungen');
  await page.waitForSelector('.person-row');
  await page.screenshot({ path: path.join(OUT, 'handy-einstellungen.jpg'), quality: 85, fullPage: true });

  // Pinnwand: Foto eines Papiers (im Browser gezeichnet) in den Ordner „Wohnung“
  const jpeg = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 600; c.height = 800;
    const g = c.getContext('2d'); g.fillStyle = '#fbfaf5'; g.fillRect(0, 0, 600, 800);
    g.fillStyle = '#333'; g.font = '36px serif'; g.fillText('Übergabeprotokoll', 40, 80);
    for (let y = 140; y < 760; y += 30) g.fillRect(40, y, 400 + (y % 120), 3);
    return c.toDataURL('image/jpeg', 0.8).split(',')[1];
  });
  await upload(wohnung, 'image/jpeg', Buffer.from(jpeg, 'base64'), 'Übergabeprotokoll');

  await page.goto(BASE + '/#/pinnwand');
  await page.waitForSelector('#view-pinnwand .pin-tile');
  check(await page.locator('#view-pinnwand .pin-tile').count() === 4, 'Pinnwand: 4 Kacheln (WLAN, Nummern, Notizen, Ordner)');
  await page.waitForFunction(() => !document.querySelector('.toast'), null, { timeout: 10000 });
  await page.screenshot({ path: path.join(OUT, 'handy-pinnwand.jpg'), quality: 85 });

  // WLAN anlegen
  await page.locator('.pin-tile', { hasText: 'WLAN' }).click();
  await page.waitForSelector('#view-pinnwand .corkboard');
  await page.locator('[data-focus-key="board-new"]').click();
  await page.locator('[data-focus-key="form-title"]').fill('WLAN für Gäste');
  await page.locator('[data-focus-key="form-ssid"]').fill('Schloss-Gäste');
  await page.locator('[data-focus-key="form-secret"]').fill('Kalzifer&Sophie2026');
  await page.screenshot({ path: path.join(OUT, 'handy-pinnwand-wlan-neu.jpg'), quality: 85 });
  await page.locator('[data-focus-key="form-save"]').click();
  await page.waitForSelector('#view-pinnwand .pin--wlan .pin-qr .qr');
  check(await page.locator('#view-pinnwand .pin--wlan .secret__value').textContent() === '••••••••', 'WLAN angepinnt, Passwort ist verdeckt');
  await page.locator('#view-pinnwand .pin--wlan .secret').click();
  check(await page.locator('#view-pinnwand .pin--wlan .secret__value').textContent() === 'Kalzifer&Sophie2026', 'Antippen zeigt das Passwort');
  await page.waitForFunction(() => !document.querySelector('.toast'), null, { timeout: 10000 });
  await page.screenshot({ path: path.join(OUT, 'handy-pinnwand-wlan.jpg'), quality: 85 });
  await page.locator('#view-pinnwand .pin-qr').click();
  await page.waitForSelector('.qr-big');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, 'handy-pinnwand-qr.jpg'), quality: 85 });
  await page.locator('.qr-big').click();
  await page.waitForSelector('.qr-big', { state: 'detached' });

  // Nummern: Notfälle sind da, eine Nummer ergänzen
  await page.locator('#view-pinnwand .back-link').click();
  await page.locator('.pin-tile', { hasText: 'Nummern' }).click();
  await page.waitForSelector('#view-pinnwand .pin--nummern');
  check(await page.locator('#view-pinnwand .phone', { hasText: '112' }).getAttribute('href') === 'tel:112', 'Notfall-Nummern sind angepinnt, antippen ruft an');
  await page.screenshot({ path: path.join(OUT, 'handy-pinnwand-nummern.jpg'), quality: 85, fullPage: true });
  await page.locator('#view-pinnwand .pin--nummern', { hasText: 'Haus & Vermieter' }).locator('.pin__edit').click();
  await page.locator('[data-focus-key="form-add-number"]').click();
  await page.locator('[data-focus-key="form-name-2"]').fill('Schlüsseldienst');
  await page.locator('[data-focus-key="form-number-2"]').fill('030 / 11 22 33');
  await page.locator('[data-focus-key="form-save"]').click();
  await page.waitForSelector('#view-pinnwand .phone:has-text("Schlüsseldienst")');
  check(await page.locator('#view-pinnwand .phone', { hasText: 'Schlüsseldienst' }).getAttribute('href') === 'tel:030112233', 'Nummer ergänzt');

  await page.goto(BASE + '/#/pinnwand/notizen');
  await page.waitForSelector('#view-pinnwand .pin--zettel');
  await page.waitForFunction(() => !document.querySelector('.toast'), null, { timeout: 10000 });
  await page.screenshot({ path: path.join(OUT, 'handy-pinnwand-notizen.jpg'), quality: 85 });

  // Ordner: neuen Unterordner anlegen, PDF mit Name + Notiz hochladen
  await page.goto(BASE + '/#/pinnwand/ordner');
  await page.waitForSelector('#view-pinnwand .folder');
  await page.screenshot({ path: path.join(OUT, 'handy-pinnwand-ordner.jpg'), quality: 85 });
  await page.locator('[data-focus-key="folder-new"]').click();
  await page.locator('[data-focus-key="folder-new-name"]').fill('Versicherungen');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#view-pinnwand .folder:has-text("Versicherungen")');
  check(true, 'Neuen Ordner angelegt');
  await page.locator('#view-pinnwand .folder', { hasText: 'Verträge' }).click();
  await page.waitForSelector('#view-pinnwand .doc');
  await page.locator('#view-pinnwand input[type="file"]').setInputFiles({ name: 'Strom 2026.pdf', mimeType: 'application/pdf', buffer: fakePdf });
  await page.waitForSelector('[data-focus-key="pending-name-0"]');
  check(await page.locator('[data-focus-key="pending-name-0"]').inputValue() === 'Strom 2026', 'Name aus dem Dateinamen vorausgefüllt');
  await page.locator('[data-focus-key="pending-name-0"]').fill('Stromvertrag');
  await page.locator('[data-focus-key="pending-note-0"]').fill('Abschlag 68 €/Monat');
  await page.screenshot({ path: path.join(OUT, 'handy-pinnwand-datei-neu.jpg'), quality: 85 });
  await page.locator('[data-focus-key="pending-save"]').click();
  await page.waitForSelector('#view-pinnwand .doc:has-text("Stromvertrag.pdf")');
  check(await page.locator('#view-pinnwand .doc', { hasText: 'Stromvertrag.pdf' }).locator('.doc__note').textContent() === 'Abschlag 68 €/Monat', 'PDF mit Name und Notiz im Ordner');
  const pdfHref = await page.locator('#view-pinnwand .doc', { hasText: 'Stromvertrag.pdf' }).locator('.doc__open').getAttribute('href');
  check((await fetch(BASE + pdfHref)).headers.get('content-type') === 'application/pdf', 'PDF lässt sich öffnen');
  await page.waitForFunction(() => !document.querySelector('.toast'), null, { timeout: 10000 });
  await page.screenshot({ path: path.join(OUT, 'handy-pinnwand-ordner-vertraege.jpg'), quality: 85 });
  // verschieben
  await page.locator('#view-pinnwand .doc', { hasText: 'Haftpflicht' }).locator('.doc__edit').click();
  await page.locator('[data-focus-key="doc-folder"]').selectOption({ label: 'Versicherungen' });
  await page.locator('[data-focus-key="doc-save"]').click();
  await page.waitForSelector('#view-pinnwand .doc:has-text("Haftpflicht")', { state: 'detached' });
  check(true, 'Datei in anderen Ordner verschoben');
  // Suche
  await page.goto(BASE + '/#/pinnwand/ordner');
  await page.locator('[data-focus-key="doc-search"]').fill('kaution');
  await page.waitForSelector('#view-pinnwand .doc:has-text("Mietvertrag")');
  check(await page.locator('#view-pinnwand .doc').count() === 1, 'Suche findet auch Text in der Notiz');
  await page.locator('[data-focus-key="doc-search"]').fill('');
  await page.goto(BASE + '/#/pinnwand/ordner/' + wohnung.id);
  await page.locator('#view-pinnwand .doc', { hasText: 'Übergabeprotokoll' }).locator('.doc__open').click();
  await page.waitForSelector('.doc-image');
  await page.waitForFunction(() => document.querySelector('.doc-image')?.naturalWidth > 0);
  check(true, 'Foto eines Papiers lässt sich groß ansehen');
  await page.locator('.lightbox--doc').click();
  await phone.close();

  // ---------- Handy dunkel ----------
  const dark = await device({ ...devices['iPhone 13'], colorScheme: 'dark' });
  page = await dark.newPage(); watch(page);
  await page.goto(BASE + '/#/vorrat');
  await page.waitForSelector('.chip');
  await page.screenshot({ path: path.join(OUT, 'handy-vorrat-dunkel.jpg'), quality: 85 });
  await page.goto(BASE + '/#/haushalt');
  await page.waitForSelector('#view-haushalt .chip');
  await page.screenshot({ path: path.join(OUT, 'handy-haushalt-dunkel.jpg'), quality: 85 });
  await page.goto(BASE + '/#/liste');
  await page.waitForSelector('.check-row');
  await page.screenshot({ path: path.join(OUT, 'handy-liste-dunkel.jpg'), quality: 85 });
  await page.goto(BASE + '/#/aufgaben');
  await page.waitForSelector('#view-aufgaben .task');
  await page.screenshot({ path: path.join(OUT, 'handy-aufgaben-dunkel.jpg'), quality: 85 });
  await page.goto(BASE + '/#/kalender');
  await page.waitForSelector('#view-kalender .cal-week');
  await page.screenshot({ path: path.join(OUT, 'handy-kalender-dunkel.jpg'), quality: 85 });
  await page.goto(BASE + '/#/kalender/monat');
  await page.waitForSelector('#view-kalender .cal-month');
  await page.screenshot({ path: path.join(OUT, 'handy-kalender-monat-dunkel.jpg'), quality: 85 });
  await page.goto(BASE + '/#/einstellungen');
  await page.waitForSelector('.person-row');
  await page.screenshot({ path: path.join(OUT, 'handy-einstellungen-dunkel.jpg'), quality: 85 });
  await page.goto(BASE + '/#/kochen');
  await page.waitForSelector('#view-kochen .day-card.is-today');
  await page.screenshot({ path: path.join(OUT, 'handy-kochen-dunkel.jpg'), quality: 85 });
  await page.goto(BASE + '/#/kochen/rezepte');
  await page.waitForSelector('#view-kochen .recipe-card');
  await page.screenshot({ path: path.join(OUT, 'handy-rezepte-dunkel.jpg'), quality: 85 });
  await page.goto(BASE + '/#/pinnwand');
  await page.waitForSelector('#view-pinnwand .pin-tile');
  await page.screenshot({ path: path.join(OUT, 'handy-pinnwand-dunkel.jpg'), quality: 85 });
  await page.goto(BASE + '/#/pinnwand/wlan');
  await page.waitForSelector('#view-pinnwand .pin');
  await page.screenshot({ path: path.join(OUT, 'handy-pinnwand-wlan-dunkel.jpg'), quality: 85 });
  await page.goto(BASE + '/#/pinnwand/ordner/' + wohnung.id);
  await page.waitForSelector('#view-pinnwand .doc');
  await page.screenshot({ path: path.join(OUT, 'handy-pinnwand-ordner-dunkel.jpg'), quality: 85 });
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
  await page.goto(BASE + '/#/haushalt');
  await page.waitForSelector('#view-haushalt .chip');
  check(await page.locator('#view-liste').isVisible(), 'PC: Haushalt und Liste nebeneinander');
  await page.mouse.move(0, 0);
  await page.screenshot({ path: path.join(OUT, 'pc-haushalt-und-liste.jpg'), quality: 85 });
  await page.goto(BASE + '/#/vorrat');
  await page.waitForSelector('#view-vorrat .chip');

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
  await page.goto(BASE + '/#/kalender');
  await page.waitForSelector('#view-kalender .cal-week');
  await page.mouse.move(0, 0);
  await page.screenshot({ path: path.join(OUT, 'pc-kalender-woche.jpg'), quality: 85 });
  await page.goto(BASE + '/#/kalender/monat');
  await page.waitForSelector('#view-kalender .cal-month');
  await page.screenshot({ path: path.join(OUT, 'pc-kalender-monat.jpg'), quality: 85 });
  await page.goto(BASE + '/#/kochen');
  await page.waitForSelector('#view-kochen .day-card');
  await page.screenshot({ path: path.join(OUT, 'pc-kochen.jpg'), quality: 85 });
  await page.goto(BASE + '/#/kochen/rezepte');
  await page.waitForSelector('#view-kochen .recipe-card');
  await page.locator('#view-kochen .recipe-card__title', { hasText: 'Chili' }).click();
  await page.waitForSelector('#view-kochen .ing-list');
  await page.screenshot({ path: path.join(OUT, 'pc-rezept.jpg'), quality: 85 });
  await page.goto(BASE + '/#/pinnwand');
  await page.waitForSelector('#view-pinnwand .pin-tile');
  await page.mouse.move(0, 0);
  await page.screenshot({ path: path.join(OUT, 'pc-pinnwand.jpg'), quality: 85 });
  await page.goto(BASE + '/#/pinnwand/nummern');
  await page.waitForSelector('#view-pinnwand .pin');
  await page.screenshot({ path: path.join(OUT, 'pc-pinnwand-nummern.jpg'), quality: 85 });
  await page.goto(BASE + '/#/pinnwand/ordner');
  await page.waitForSelector('#view-pinnwand .folder');
  await page.screenshot({ path: path.join(OUT, 'pc-pinnwand-ordner.jpg'), quality: 85 });

  const desktopDark = await device({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: 'dark' });
  page = await desktopDark.newPage(); watch(page);
  await page.goto(BASE + '/#/liste');
  await page.waitForSelector('.chip');
  await page.screenshot({ path: path.join(OUT, 'pc-dunkel.jpg'), quality: 85 });
  await page.goto(BASE + '/#/aufgaben');
  await page.waitForSelector('#view-aufgaben .task');
  await page.screenshot({ path: path.join(OUT, 'pc-aufgaben-dunkel.jpg'), quality: 85 });
  await page.goto(BASE + '/#/kalender/monat');
  await page.waitForSelector('#view-kalender .cal-month');
  await page.screenshot({ path: path.join(OUT, 'pc-kalender-monat-dunkel.jpg'), quality: 85 });
  await page.goto(BASE + '/#/kalender');
  await page.waitForSelector('#view-kalender .cal-week');
  await page.screenshot({ path: path.join(OUT, 'pc-kalender-dunkel.jpg'), quality: 85 });
  await page.goto(BASE + '/#/kochen/rezepte');
  await page.waitForSelector('#view-kochen .recipe-card');
  await page.screenshot({ path: path.join(OUT, 'pc-rezepte-dunkel.jpg'), quality: 85 });
  await page.goto(BASE + '/#/pinnwand/wlan');
  await page.waitForSelector('#view-pinnwand .pin');
  await page.screenshot({ path: path.join(OUT, 'pc-pinnwand-dunkel.jpg'), quality: 85 });
  await page.goto(BASE + '/#/pinnwand/ordner/' + vertraege.id);
  await page.waitForSelector('#view-pinnwand .doc');
  await page.screenshot({ path: path.join(OUT, 'pc-pinnwand-ordner-dunkel.jpg'), quality: 85 });

  await browser.close();
  calServer.close();
  check(errors.length === 0, `keine Fehler in der Browser-Konsole ${errors.length ? JSON.stringify(errors) : ''}`);
  console.log('Screenshots in', OUT);
})().catch((e) => { console.error(e); process.exit(1); });
