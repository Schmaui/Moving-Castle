// Ansicht "Aufgaben" (/#/aufgaben): gemeinsame To-dos für den Haushalt.
// - Abhaken gilt für beide (liegt auf dem Server) – mit "Rückgängig".
// - Optional: fällig am, wer macht's, wiederholen, Notiz.
// - Man sieht, wer eine Aufgabe eingetragen und wer sie erledigt hat.
// Fällige Aufgaben hängen zusätzlich als Zettel im Vorrat (dueNoteCard unten).
import { h, today, addDays, addMonths, formatDue, formatWhen } from '../util.js';
import { viewHeader, emptyState, loading, iconLabel, plannerTabs } from '../ui/components.js';
import { icon } from '../ui/art.js';
import { avatar, byline } from '../ui/people.js';
import { showToast } from '../ui/toast.js';
import {
  me, personById, addTask, updateTask, completeTask, reopenTask, deleteTask, restoreTask,
} from '../store.js';

const CHECK_ANIMATION_MS = 350;

// Wiederholungen (gleiche Liste wie in server/modules/tasks.js)
export const REPEATS = [
  { id: null, label: 'nie' },
  { id: 'taeglich', label: 'täglich' },
  { id: 'woechentlich', label: 'wöchentlich' },
  { id: '2wochen', label: 'alle 2 Wochen' },
  { id: 'monatlich', label: 'monatlich' },
];
const repeatLabel = (id) => REPEATS.find((r) => r.id === id)?.label || '';

// Zustand nur dieser Ansicht (bleibt beim Neuzeichnen erhalten)
const emptyDraft = () => ({ title: '', due: null, assigneeId: null, repeat: null, note: '' });
const ui = {
  filter: 'alle',          // 'alle' oder id einer Person
  draft: emptyDraft(),     // neue Aufgabe
  detailsOpen: false,      // "Details" beim Neuanlegen aufgeklappt
  editingId: null,         // Aufgabe, die gerade bearbeitet wird
  edit: null,              // deren Entwurf
  checking: new Set(),     // gerade abgehakt (kurze Animation)
  showAllDone: false,
};

/** Offene Aufgaben, die heute (oder schon früher) dran sind. */
const isDran = (t) => !t.done && t.due && t.due <= today();
const byDue = (a, b) => (a.due || '9999').localeCompare(b.due || '9999') || a.id - b.id;

export default {
  id: 'aufgaben',
  label: 'Aufgaben',
  icon: 'klemmbrett',
  inNav: false,   // liegt in der Leiste unter "Planer" (Reiter oben)

  // Badge: was heute dran ist – für mich oder für "egal wer"
  badge: (state) => (state.tasks || [])
    .filter((t) => isDran(t) && (t.assigneeId == null || t.assigneeId === me()?.id)).length,

  render(state, ctx) {
    if (!state.loaded) return loading();
    const tasks = state.tasks || [];
    const visible = (t) => ui.filter === 'alle' || t.assigneeId == null || t.assigneeId === ui.filter;
    const open = tasks.filter((t) => !t.done && visible(t)).sort(byDue);
    const dran = open.filter(isDran);

    const header = viewHeader({
      id: 'title-aufgaben',
      title: 'Aufgaben',
      subtitle: open.length
        ? [`${open.length} offen`, dran.length && `${dran.length} heute dran`].filter(Boolean).join(' ~ ')
        : 'Alles erledigt ♡',
    });

    const groups = [
      { title: 'Heute dran', tone: 2, list: dran, art: 'stern' },
      { title: 'Demnächst', tone: 4, list: open.filter((t) => t.due && t.due > today()), art: 'kalender' },
      { title: 'Irgendwann', tone: 6, list: open.filter((t) => !t.due), art: 'blatt' },
    ].filter((g) => g.list.length);

    return [
      plannerTabs('aufgaben'),
      header,
      filterRow(state, ctx),
      h('div', { class: 'cards cards--tasks' },
        newTaskCard(state, ctx),
        groups.length
          ? groups.map((g) => h('section', { class: 'card card--note', 'data-tone': g.tone },
            h('div', { class: 'card__header' },
              h('span', { class: 'card__icon' }, icon(g.art)),
              h('h2', { class: 'card__title' }, g.title),
              h('span', { class: 'card__meta' }, `${g.list.length}×`),
            ),
            h('ul', { class: 'task-list' }, g.list.map((t) => taskItem(t, state, ctx))),
          ))
          : emptyState({
            symbol: 'klemmbrett',
            title: ui.filter === 'alle' ? 'Nichts zu tun!' : 'Hier ist nichts offen',
            text: 'Zeit für einen Tee ♡',
          }),
        doneCard(tasks.filter((t) => t.done && visible(t)), ctx),
      ),
    ];
  },
};

// ---------- Filter: Alle / Kait / Schmaui ----------
function filterRow(state, ctx) {
  if (!state.people.length) return null;
  const pill = (value, ...content) => h('button', {
    type: 'button',
    class: ['pill', ui.filter === value && 'is-chosen'],
    'aria-pressed': String(ui.filter === value),
    'data-focus-key': `filter-${value}`,
    onclick: () => { ui.filter = value; ctx.rerender(); },
  }, ...content);
  return h('div', { class: 'pills pills--filter', role: 'group', 'aria-label': 'Aufgaben zeigen für' },
    pill('alle', 'Alle'),
    state.people.map((p) => pill(p.id, avatar(p, { size: 'xs' }), p.name)),
  );
}

// ---------- Neue Aufgabe ----------
function newTaskCard(state, ctx) {
  const d = ui.draft;
  return h('form', {
    class: 'card task-new',
    'data-tone': 3,
    onsubmit: async (e) => {
      e.preventDefault();
      const title = d.title.trim();
      if (!title) {
        document.querySelector('[data-focus-key="task-new"]')?.focus();
        return;
      }
      const created = await addTask({ ...d, title, note: d.note.trim() || null });
      if (created) {
        ui.draft = emptyDraft();
        ui.detailsOpen = false;
        showToast(`„${title}“ eingetragen`);
        ctx.rerender();
      }
    },
  },
    h('div', { class: 'card__header' },
      h('span', { class: 'card__icon' }, icon('stift')),
      h('h2', { class: 'card__title' }, 'Neue Aufgabe'),
    ),
    h('div', { class: 'add-form add-form--tight' },
      h('input', {
        class: 'input', type: 'text', maxlength: 120, placeholder: 'Was ist zu tun?',
        'aria-label': 'Was ist zu tun?', 'data-focus-key': 'task-new', autocomplete: 'off', enterkeyhint: 'done',
        value: d.title,
        oninput: (e) => { d.title = e.target.value; },
      }),
      h('button', { class: 'btn btn--primary', type: 'submit' }, 'Eintragen'),
    ),
    h('button', {
      type: 'button',
      class: 'task-new__more',
      'aria-expanded': String(ui.detailsOpen),
      'data-focus-key': 'task-details',
      onclick: () => { ui.detailsOpen = !ui.detailsOpen; ctx.rerender(); },
    }, icon(ui.detailsOpen ? 'minus' : 'plus', { wash: false }),
    ui.detailsOpen ? 'weniger' : 'wann, wer, wiederholen, Notiz …',
    !ui.detailsOpen && summary(d)),
    ui.detailsOpen && taskFields(d, 'new', state, ctx),
  );
}

/** Kurze Zusammenfassung der gewählten Details (wenn zugeklappt). */
function summary(d) {
  const parts = [d.due && formatDue(d.due), personById(d.assigneeId)?.name, d.repeat && repeatLabel(d.repeat)].filter(Boolean);
  return parts.length ? h('span', { class: 'task-new__summary' }, `(${parts.join(', ')})`) : null;
}

// ---------- Felder: wann, wer, wiederholen, Notiz (für neu + bearbeiten) ----------
function taskFields(d, key, state, ctx) {
  const t = today();
  const saturday = addDays(t, (6 - new Date().getDay() + 7) % 7);
  const quick = [
    { label: 'Heute', value: t },
    { label: 'Morgen', value: addDays(t, 1) },
    { label: 'Wochenende', value: saturday },
    { label: 'Nächste Woche', value: addDays(t, 7) },
    { label: 'Kein Datum', value: null },
  ];
  const set = (field, value) => () => { d[field] = value; ctx.rerender(); };
  const pill = (chosen, focusKey, onclick, ...content) => h('button', {
    type: 'button', class: ['pill', chosen && 'is-chosen'], 'aria-pressed': String(chosen),
    'data-focus-key': `${key}-${focusKey}`, onclick,
  }, ...content);

  return h('div', { class: 'task-fields' },
    h('fieldset', { class: 'choice' },
      h('legend', { class: 'choice__legend' }, iconLabel('kalender', 'Wann?')),
      h('div', { class: 'pills' },
        quick.map((q) => pill(d.due === q.value, `due-${q.label}`, set('due', q.value), q.label)),
        h('input', {
          class: 'input input--date', type: 'date', 'aria-label': 'Datum wählen',
          'data-focus-key': `${key}-date`, value: d.due || '',
          onchange: (e) => { d.due = e.target.value || null; ctx.rerender(); },
        }),
      ),
    ),
    state.people.length > 0 && h('fieldset', { class: 'choice' },
      h('legend', { class: 'choice__legend' }, 'Wer macht’s?'),
      h('div', { class: 'pills' },
        pill(d.assigneeId == null, 'who-any', set('assigneeId', null), 'egal wer'),
        state.people.map((p) => pill(d.assigneeId === p.id, `who-${p.id}`, set('assigneeId', p.id), avatar(p, { size: 'xs' }), p.name)),
      ),
    ),
    h('fieldset', { class: 'choice' },
      h('legend', { class: 'choice__legend' }, iconLabel('wiederholen', 'Wiederholen?')),
      h('div', { class: 'pills' },
        REPEATS.map((r) => pill(d.repeat === r.id, `rep-${r.id}`, set('repeat', r.id), r.label)),
      ),
    ),
    h('label', { class: 'choice' },
      h('span', { class: 'choice__legend' }, iconLabel('notiz', 'Notiz')),
      h('textarea', {
        class: 'input input--area', rows: 2, maxlength: 1000, placeholder: 'z. B. „Termin ist um 14 Uhr“',
        'data-focus-key': `${key}-note`, value: d.note || '',
        oninput: (e) => { d.note = e.target.value; },
      }),
    ),
  );
}

// ---------- Eine Aufgabe ----------
function taskItem(task, state, ctx, { compact = false } = {}) {
  if (!compact && ui.editingId === task.id) return h('li', { class: 'task task--editing' }, editForm(task, state, ctx));
  const assignee = personById(task.assigneeId);
  const overdue = task.due && task.due < today();
  const meta = [
    task.due && h('span', { class: ['task__due', overdue && 'is-overdue', task.due === today() && 'is-today'] },
      icon('kalender', { wash: false }), formatDue(task.due)),
    task.repeat && h('span', { class: 'task__tag' }, icon('wiederholen', { wash: false }), repeatLabel(task.repeat)),
    !compact && task.note && h('span', { class: 'task__tag task__note' }, icon('notiz', { wash: false }), task.note.split('\n')[0]),
    !compact && task.createdBy && h('span', { class: 'task__tag' }, `von ${personById(task.createdBy)?.name || '?'}`),
  ].filter(Boolean);

  return h('li', { class: ['task', ui.checking.has(task.id) && 'is-checked'] },
    h('button', {
      type: 'button',
      class: 'task__check',
      'aria-label': `${task.title} erledigt`,
      'data-focus-key': `task-check-${task.id}`,
      onclick: () => complete(task, ctx),
    }, h('span', { class: 'check-row__box', 'aria-hidden': 'true' }, checkMark())),
    h(compact ? 'a' : 'button', {
      type: compact ? null : 'button',
      href: compact ? '#/aufgaben' : null,
      class: 'task__main',
      'aria-label': compact ? null : `${task.title} bearbeiten`,
      'data-focus-key': `task-${task.id}`,
      onclick: compact ? null : () => startEdit(task, ctx),
    },
      h('span', { class: 'task__title' }, task.title),
      meta.length > 0 && h('span', { class: 'task__meta' }, meta),
    ),
    assignee && avatar(assignee, { size: 'sm', label: true, className: 'task__who' }),
  );
}

function startEdit(task, ctx) {
  ui.editingId = task.id;
  ui.edit = { title: task.title, due: task.due, assigneeId: task.assigneeId, repeat: task.repeat, note: task.note || '' };
  ctx.rerender();
  document.querySelector(`[data-focus-key="edit-title-${task.id}"]`)?.focus();
}

function editForm(task, state, ctx) {
  const d = ui.edit;
  const close = () => { ui.editingId = null; ui.edit = null; ctx.rerender(); };
  return h('form', {
    class: 'task-edit',
    onsubmit: async (e) => {
      e.preventDefault();
      const title = d.title.trim();
      if (!title) return;
      const patch = {};
      const next = { ...d, title, note: d.note.trim() || null };
      for (const k of ['title', 'due', 'assigneeId', 'repeat', 'note']) if (next[k] !== task[k]) patch[k] = next[k];
      close();
      if (Object.keys(patch).length) await updateTask(task, patch);
    },
    onkeydown: (e) => { if (e.key === 'Escape') close(); },
  },
    h('input', {
      class: 'input task-edit__title', type: 'text', maxlength: 120, 'aria-label': 'Aufgabe',
      'data-focus-key': `edit-title-${task.id}`, autocomplete: 'off', enterkeyhint: 'done', value: d.title,
      oninput: (e) => { d.title = e.target.value; },
    }),
    taskFields(d, `edit-${task.id}`, state, ctx),
    task.createdBy && h('p', { class: 'task-edit__by' }, byline(task.createdBy, `eingetragen ${formatWhen(task.createdAt)}`)),
    h('div', { class: 'add-form' },
      h('button', { type: 'submit', class: 'btn btn--primary' }, 'Speichern'),
      h('button', { type: 'button', class: 'btn btn--ghost', onclick: close }, 'Abbrechen'),
      h('button', {
        type: 'button', class: 'btn btn--icon btn--danger task-edit__delete', 'aria-label': 'Aufgabe löschen', title: 'Löschen',
        onclick: () => {
          close();
          deleteTask(task);
          showToast(`„${task.title}“ gelöscht`, { actionLabel: 'Rückgängig', onAction: () => restoreTask(task) });
        },
      }, icon('muell', { wash: false })),
    ),
  );
}

/** Abhaken: kurze Animation, dann speichern. Bei Wiederholung gleich die nächste anlegen. */
function complete(task, ctx) {
  if (ui.checking.has(task.id)) return;
  ui.checking.add(task.id);
  ctx.rerender();
  setTimeout(async () => {
    ui.checking.delete(task.id);
    const nextDue = task.repeat ? nextDueOf(task) : null;
    const result = await completeTask(task, nextDue);
    if (!result) return;
    showToast(
      task.repeat ? `Erledigt ♡ Nächstes Mal: ${formatDue(nextDue)}` : `„${task.title}“ erledigt ♡`,
      { actionLabel: 'Rückgängig', onAction: () => reopenTask(result.task, result.next) },
    );
  }, CHECK_ANIMATION_MS);
}

/** Nächster Termin: ab dem Fälligkeitstag (falls früher erledigt), sonst ab heute. */
export function nextDueOf(task) {
  const base = task.due && task.due > today() ? task.due : today();
  switch (task.repeat) {
    case 'taeglich': return addDays(base, 1);
    case 'woechentlich': return addDays(base, 7);
    case '2wochen': return addDays(base, 14);
    case 'monatlich': return addMonths(base, 1);
    default: return null;
  }
}

// ---------- Erledigt (Verlauf) ----------
function doneCard(done, ctx) {
  if (!done.length) return null;
  const sorted = [...done].sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || ''));
  const shown = ui.showAllDone ? sorted.slice(0, 30) : sorted.slice(0, 5);
  return h('section', { class: 'card card--note card--done', 'data-tone': 1 },
    h('div', { class: 'card__header' },
      h('span', { class: 'card__icon' }, icon('haken')),
      h('h2', { class: 'card__title' }, 'Erledigt'),
    ),
    h('ul', { class: 'task-list' }, shown.map((t) => h('li', { class: 'task task--done' },
      h('span', { class: 'task__check' }, h('span', { class: 'check-row__box', 'aria-hidden': 'true' }, checkMark())),
      h('span', { class: 'task__main' },
        h('span', { class: 'task__title' }, t.title),
        h('span', { class: 'task__meta' }, byline(t.doneBy, formatWhen(t.doneAt))),
      ),
      !t.repeat && h('button', {
        type: 'button', class: 'btn btn--icon btn--ghost', 'aria-label': `${t.title} wieder öffnen`, title: 'Wieder öffnen',
        onclick: () => reopenTask(t, null),
      }, icon('wiederholen', { wash: false })),
    ))),
    sorted.length > 5 && h('button', {
      type: 'button', class: 'btn btn--ghost btn--small', 'data-focus-key': 'done-more',
      onclick: () => { ui.showAllDone = !ui.showAllDone; ctx.rerender(); },
    }, ui.showAllDone ? 'weniger zeigen' : `alle ${Math.min(sorted.length, 30)} zeigen`),
  );
}

// ---------- Zettel "Heute dran" für die Kühlschranktür (Vorrat) ----------
export function dueNoteCard(state, ctx) {
  const dran = (state.tasks || []).filter(isDran).sort(byDue);
  if (!dran.length) return null;
  return h('section', { class: 'card card--note card--due', 'data-tone': 2 },
    h('div', { class: 'card__header' },
      h('span', { class: 'card__icon' }, icon('klemmbrett')),
      h('h2', { class: 'card__title' }, 'Heute dran'),
      h('a', { class: 'card__link', href: '#/aufgaben' }, 'alle Aufgaben'),
    ),
    h('ul', { class: 'task-list' }, dran.slice(0, 4).map((t) => taskItem(t, state, ctx, { compact: true }))),
    dran.length > 4 && h('a', { class: 'card__more', href: '#/aufgaben' }, `+ ${dran.length - 4} weitere`),
  );
}

/** Gezeichnetes Häkchen (wie in der Einkaufsliste). */
function checkMark() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 48 48');
  svg.setAttribute('class', 'check-mark');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', 'M9.6 25.4c3.4 2.6 6.4 5.8 8.6 9.8 4.6-10 11.6-18.6 20.4-24.6');
  path.setAttribute('pathLength', '1');
  svg.append(path);
  return svg;
}
