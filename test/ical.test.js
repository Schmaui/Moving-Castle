// Tests für den Kalender-Leser (server/ical.js). Aufruf: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expandIcs, parseIcs } from '../server/ical.js';

// So ähnlich sieht ein "Öffentlicher Kalender" von iCloud aus
const ICS = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//Apple Inc.//macOS 15//EN',
  'X-WR-CALNAME:Wir zwei',
  'X-WR-TIMEZONE:Europe/Berlin',
  'BEGIN:VTIMEZONE',
  'TZID:Europe/Berlin',
  'BEGIN:DAYLIGHT',
  'DTSTART:19810329T020000',
  'TZOFFSETTO:+0200',
  'END:DAYLIGHT',
  'END:VTIMEZONE',
  // einfacher Termin mit Ort und mehrzeiliger Notiz (gefaltete Zeile!)
  'BEGIN:VEVENT',
  'UID:zahnarzt',
  'DTSTART;TZID=Europe/Berlin:20261110T093000',
  'DTEND;TZID=Europe/Berlin:20261110T103000',
  'SUMMARY:Zahnarzt Kait',
  'LOCATION:Praxis Dr. Müller\\, Hauptstr. 5',
  'DESCRIPTION:Karte mitnehmen\\nVorher nichts essen und eine sehr lange Zeile die ',
  ' umgebrochen wurde',
  'END:VEVENT',
  // in UTC angegeben -> 18:00 Berlin (Winterzeit)
  'BEGIN:VEVENT',
  'UID:utc',
  'DTSTART:20261112T170000Z',
  'DTEND:20261112T180000Z',
  'SUMMARY:Videocall',
  'END:VEVENT',
  // ganztägig, 2 Tage
  'BEGIN:VEVENT',
  'UID:urlaub',
  'DTSTART;VALUE=DATE:20261120',
  'DTEND;VALUE=DATE:20261122',
  'SUMMARY:Wochenende bei Oma',
  'END:VEVENT',
  // wöchentlich Mo+Do, 4 Mal, ein Termin fällt aus, einer ist verschoben
  'BEGIN:VEVENT',
  'UID:sport',
  'DTSTART;TZID=Europe/Berlin:20261109T190000',
  'DTEND;TZID=Europe/Berlin:20261109T200000',
  'RRULE:FREQ=WEEKLY;BYDAY=MO,TH;COUNT=4',
  'EXDATE;TZID=Europe/Berlin:20261112T190000',
  'SUMMARY:Yoga',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:sport',
  'RECURRENCE-ID;TZID=Europe/Berlin:20261116T190000',
  'DTSTART;TZID=Europe/Berlin:20261116T203000',
  'DTEND;TZID=Europe/Berlin:20261116T213000',
  'SUMMARY:Yoga (später)',
  'END:VEVENT',
  // jeden 2. Dienstag im Monat, über die Zeitumstellung im März hinweg
  'BEGIN:VEVENT',
  'UID:stammtisch',
  'DTSTART;TZID=Europe/Berlin:20260210T200000',
  'DURATION:PT2H',
  'RRULE:FREQ=MONTHLY;BYDAY=2TU;UNTIL=20260430T235959Z',
  'SUMMARY:Stammtisch',
  'END:VEVENT',
  // Geburtstag jedes Jahr (ganztägig)
  'BEGIN:VEVENT',
  'UID:geburtstag',
  'DTSTART;VALUE=DATE:20000305',
  'RRULE:FREQ=YEARLY',
  'SUMMARY:Geburtstag Schmaui 🎂',
  'END:VEVENT',
  // abgesagt -> taucht nicht auf
  'BEGIN:VEVENT',
  'UID:abgesagt',
  'DTSTART;TZID=Europe/Berlin:20261111T120000',
  'STATUS:CANCELLED',
  'SUMMARY:Fällt aus',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

const all = expandIcs(ICS, { from: '2026-01-01', to: '2027-12-31' });
const byTitle = (t) => all.events.filter((e) => e.title === t);

test('Kalendername und einfacher Termin mit Zeitzone', () => {
  assert.equal(all.name, 'Wir zwei');
  const [z] = byTitle('Zahnarzt Kait');
  assert.equal(z.start, '2026-11-10T09:30');
  assert.equal(z.end, '2026-11-10T10:30');
  assert.equal(z.location, 'Praxis Dr. Müller, Hauptstr. 5');
  assert.equal(z.notes, 'Karte mitnehmen\nVorher nichts essen und eine sehr lange Zeile die umgebrochen wurde');
  assert.equal(z.allDay, false);
});

test('UTC-Zeit wird in deutsche Zeit umgerechnet', () => {
  assert.equal(byTitle('Videocall')[0].start, '2026-11-12T18:00');
});

test('Ganztägig über zwei Tage', () => {
  const [u] = byTitle('Wochenende bei Oma');
  assert.deepEqual([u.start, u.end, u.allDay], ['2026-11-20', '2026-11-22', true]);
});

test('Wöchentlich mit COUNT, EXDATE und verschobenem Termin', () => {
  assert.deepEqual(byTitle('Yoga').map((e) => e.start), ['2026-11-09T19:00', '2026-11-19T19:00']);
  assert.deepEqual(byTitle('Yoga (später)').map((e) => e.start), ['2026-11-16T20:30']);
});

test('Jeden 2. Dienstag, auch nach der Zeitumstellung um 20 Uhr', () => {
  assert.deepEqual(byTitle('Stammtisch').map((e) => e.start), ['2026-02-10T20:00', '2026-03-10T20:00', '2026-04-14T20:00']);
  assert.equal(byTitle('Stammtisch')[2].end, '2026-04-14T22:00');
});

test('Jährlicher Geburtstag nur im gewünschten Zeitraum', () => {
  assert.deepEqual(byTitle('Geburtstag Schmaui 🎂').map((e) => e.start), ['2026-03-05', '2027-03-05']);
});

test('Abgesagte Termine fehlen', () => {
  assert.equal(byTitle('Fällt aus').length, 0);
});

test('Keine Kalender-Datei -> Fehler', () => {
  assert.throws(() => parseIcs('<html>Hallo</html>'), /keine Kalender-Datei/);
});

test('Monatlich am 31. überspringt kurze Monate, -1 = letzter Tag', () => {
  const ics = ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:a', 'DTSTART;VALUE=DATE:20260131', 'RRULE:FREQ=MONTHLY;COUNT=3', 'SUMMARY:A', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:b', 'DTSTART;VALUE=DATE:20260130', 'RRULE:FREQ=MONTHLY;BYMONTHDAY=-1;COUNT=3', 'SUMMARY:B', 'END:VEVENT', 'END:VCALENDAR'].join('\n');
  const r = expandIcs(ics, { from: '2026-01-01', to: '2026-12-31' });
  assert.deepEqual(r.events.filter((e) => e.title === 'A').map((e) => e.start), ['2026-01-31', '2026-03-31', '2026-05-31']);
  assert.deepEqual(r.events.filter((e) => e.title === 'B').map((e) => e.start), ['2026-01-31', '2026-02-28', '2026-03-31']);
});
