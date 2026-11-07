// Modul: Aufgaben (z. B. "Altglas wegbringen", "Geschenk für Mama besorgen").
//
//   GET    /api/tasks                  Liste (kommt auch in /api/state mit)
//   POST   /api/tasks                  Neue Aufgabe
//   PATCH  /api/tasks/:id              Ändern (Titel, Notiz, fällig, wer, wiederholen …)
//   POST   /api/tasks/:id/erledigt     Abhaken. Bei Wiederholung entsteht gleich die
//                                      nächste Aufgabe – Body: { "nextDue": "JJJJ-MM-TT" }
//                                      (das Datum rechnet das Gerät aus, wegen der Zeitzone)
//   DELETE /api/tasks/:id              Löschen
//
// Wer eine Aufgabe angelegt bzw. erledigt hat, wird automatisch gespeichert.
// Erledigte Aufgaben bleiben als Verlauf stehen ("Kait hat … erledigt").
import { registerCrud, actorOf } from '../resource.js';
import { HttpError, readJson } from '../http.js';
import { validateField } from '../validate.js';
import { bumpRev, now, transaction } from '../db.js';
import { config } from '../config.js';

export const REPEATS = ['taeglich', 'woechentlich', '2wochen', 'monatlich'];
const DUE = { col: 'due', type: 'date' };
const KEEP_DONE_DAYS = 90; // erledigte Aufgaben nach so vielen Tagen aufräumen

export default {
  name: 'tasks',
  inState: true,
  register(ctx) {
    const { db, router } = ctx;

    // Alten Verlauf aufräumen (beim Start)
    db.prepare('DELETE FROM tasks WHERE done = 1 AND done_at < ?')
      .run(new Date(Date.now() - KEEP_DONE_DAYS * 86400000).toISOString());

    const api = registerCrud(ctx, {
      path: '/api/tasks',
      table: 'tasks',
      orderBy: 'id',
      fields: {
        title:      { col: 'title',       type: 'text', required: true, max: 120 },
        note:       { col: 'note',        type: 'text', max: 1000, multiline: true },
        due:        DUE,
        repeat:     { col: 'repeat',      type: 'text', values: REPEATS },
        assigneeId: { col: 'assignee_id', type: 'int',  ref: 'people' },  // leer = egal wer
        createdBy:  { col: 'created_by',  type: 'int',  readonly: true },
        done:       { col: 'done',        type: 'bool', default: 0 },
        doneBy:     { col: 'done_by',     type: 'int',  readonly: true },
        doneAt:     { col: 'done_at',     type: 'text', readonly: true },
      },
      hooks: {
        beforeWrite(values, existing, { actor }) {
          if (!existing) values.created_by = actor;
          if ('done' in values) {
            if (values.done && !existing?.done) {
              values.done_by = actor;
              values.done_at = now();
            }
            if (!values.done) {
              values.done_by = null;
              values.done_at = null;
            }
          }
        },
      },
    });

    router.post('/api/tasks/:id/erledigt', async ({ req, params }) => {
      const task = api.get(Number(params.id));
      if (!task) throw new HttpError(404, 'Aufgabe nicht gefunden');
      const body = await readJson(req, config.maxBodyBytes);
      if (task.done) return { task, next: null }; // schon erledigt (z. B. auf dem anderen Handy)
      const nextDue = task.repeat ? validateField(DUE, body.nextDue ?? null, 'nextDue') : null;
      const actor = actorOf(db, req);
      const ts = now();
      let nextId = null;
      transaction(db, () => {
        db.prepare('UPDATE tasks SET done = 1, done_by = ?, done_at = ?, updated_at = ? WHERE id = ?')
          .run(actor, ts, ts, task.id);
        if (task.repeat) {
          nextId = Number(db.prepare(
            `INSERT INTO tasks (title, note, due, repeat, assignee_id, created_by, done, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`
          ).run(task.title, task.note, nextDue, task.repeat, task.assigneeId, task.createdBy, ts, ts).lastInsertRowid);
        }
        bumpRev(db);
      });
      return { task: api.get(task.id), next: nextId ? api.get(nextId) : null };
    });

    return api;
  },
};
