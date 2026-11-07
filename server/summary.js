// „Was ist heute los?“ für eine Person – für die Morgen-Benachrichtigung und das iPhone-Widget.
// Liest direkt aus der Datenbank (bzw. dem Kalender-Modul), alles in deutscher Ortszeit.
export const ZONE = process.env.KALENDER_ZEITZONE || 'Europe/Berlin';
const MESSAGE_MS = 24 * 60 * 60 * 1000;

/** Datum und Uhrzeit in deutscher Ortszeit: { day: '2026-11-07', time: '07:30' } */
export function localNow(date = new Date(), zone = ZONE) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).map((p) => [p.type, p.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

/**
 * @param {object} ctx       { db, resources }
 * @param {number} personId  für wen (Aufgaben „für mich oder egal wer“, Nachricht an mich)
 */
export function summaryFor(ctx, personId) {
  const { db } = ctx;
  const { day } = localNow();
  const people = new Map(db.prepare('SELECT id, name FROM people').all().map((p) => [Number(p.id), p.name]));
  const nameOf = (id) => (id == null ? null : people.get(Number(id)) || null);

  const items = db.prepare(`SELECT i.name, i.missing_by, c.area FROM items i JOIN categories c ON c.id = i.category_id
    WHERE i.missing = 1 ORDER BY c.area = 'haushalt', c.sort, i.sort, i.id`).all();
  const wishes = db.prepare('SELECT name, added_by FROM wishes ORDER BY id').all();
  const list = [
    ...items.map((i) => ({ name: i.name, by: nameOf(i.missing_by) })),
    ...wishes.map((w) => ({ name: w.name, by: nameOf(w.added_by), wish: true })),
  ];

  const tasks = db.prepare(`SELECT title, due, assignee_id FROM tasks
    WHERE done = 0 AND due IS NOT NULL AND due <= ? ORDER BY due, id`).all(day)
    .filter((t) => t.assignee_id == null || Number(t.assignee_id) === personId)
    .map((t) => ({ title: t.title, overdue: t.due < day, who: nameOf(t.assignee_id) }));

  const meals = db.prepare(`SELECT m.title, m.chosen, m.slot, r.title AS recipe FROM meals m
    LEFT JOIN recipes r ON r.id = m.recipe_id WHERE m.day = ? ORDER BY m.slot`).all(day);
  const chosen = meals.find((m) => m.chosen);
  const meal = (chosen ? [chosen] : meals).map((m) => m.recipe || m.title).filter(Boolean);

  let events = [];
  try {
    events = (ctx.resources?.calendar?.api.list().events || [])
      .filter((e) => e.start.slice(0, 10) <= day && (e.allDay ? e.end.slice(0, 10) > day : e.end.slice(0, 10) >= day))
      .filter((e) => !e.people?.length || e.people.includes(personId))
      .map((e) => ({ title: e.title, time: e.allDay || e.start.slice(0, 10) < day ? null : e.start.slice(11, 16) }));
  } catch { /* Kalender nicht verbunden */ }

  const since = new Date(Date.now() - MESSAGE_MS).toISOString();
  const msg = db.prepare(`SELECT body, drawing, paper, from_person, created_at FROM door_messages
    WHERE to_person = ? AND created_at >= ? ORDER BY id DESC LIMIT 1`).get(personId, since);
  let drawing = null;
  try { drawing = msg?.drawing ? JSON.parse(msg.drawing) : null; } catch { /* egal */ }
  const message = msg ? { body: msg.body, drawing, paper: msg.paper, from: nameOf(msg.from_person), at: msg.created_at } : null;

  return { day, person: nameOf(personId), list, tasks, meal, events, message };
}
