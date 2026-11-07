// Ansicht "Kalender" (/#/kalender): eure Apple-Kalender (je Person einer) zusammen als EIN
// Kalender, nur zum Anschauen. Termine in der Farbe der Person (mit Profilbild).
//   #/kalender         Woche (mit Uhrzeiten)
//   #/kalender/monat   Monat (Tag antippen zeigt die Termine darunter)
// Liegt in der Leiste unter "Planer" (Reiter oben: Kalender · Aufgaben).
// Die Termine holt der Server alle 15 Minuten aus dem "Öffentlichen Kalender" von Apple
// (server/modules/calendar.js). Eintragen/Ändern weiter in der Kalender-App.
import { h, today, addDays, mondayOf, formatWhen } from '../util.js';
import { viewHeader, loading, iconLabel, plannerTabs } from '../ui/components.js';
import { icon } from '../ui/art.js';
import { showToast } from '../ui/toast.js';
import { connectCalendar, disconnectCalendar, syncCalendar, personById } from '../store.js';
import { avatar } from '../ui/people.js';
import aufgaben from './aufgaben.js';

const subroute = () => location.hash.replace(/^#\/?/, '').split(/[/?]/).slice(1);

// Zustand nur dieser Ansicht
const ui = {
  weekOffset: 0,
  monthOffset: 0,
  selectedDay: null,   // Monat: angetippter Tag
  links: {},           // Eingaben beim Verbinden (je Person)
  editing: new Set(),  // Personen, deren Link gerade geändert wird
  connecting: new Set(),
  manage: false,       // "Kalender verwalten" aufgeklappt
  syncing: false,
};

// ---------- Datum ----------
const pad = (n) => String(n).padStart(2, '0');
const fromDay = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const toDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fmt = (day, opts) => fromDay(day).toLocaleDateString('de-DE', opts);
const timeOf = (iso) => iso.slice(11, 16);
const dayOf = (iso) => iso.slice(0, 10);

/** Termine, die an diesem Tag stattfinden (auch mehrtägige). */
function eventsOn(events, day) {
  return events.filter((e) => {
    if (e.allDay) return e.start <= day && day < e.end;
    const s = dayOf(e.start), en = dayOf(e.end);
    if (s === day) return true;
    // läuft über Mitternacht: auch an den Folgetagen zeigen (aber nicht, wenn es genau um 0:00 endet)
    return s < day && (day < en || (day === en && timeOf(e.end) !== '00:00'));
  });
}

/** "09:30–10:30", "ganztägig", "bis 02:00" … */
function timeLabel(e, day) {
  if (e.allDay) {
    const last = addDays(e.end, -1);
    return e.start === last ? 'ganztägig' : `ganztägig · bis ${fmt(last, { day: 'numeric', month: 'numeric' })}`;
  }
  const s = dayOf(e.start) === day ? timeOf(e.start) : null;
  const en = dayOf(e.end) === day ? timeOf(e.end) : null;
  if (s && en) return s === en ? s : `${s}–${en}`;
  if (s) return `ab ${s}`;
  if (en) return `bis ${en}`;
  return 'ganztägig';
}

export default {
  id: 'kalender',
  label: 'Kalender',
  navLabel: 'Planer',
  navAlso: ['aufgaben'],
  icon: 'kalender',
  // Zahl am Knopf "Planer": was heute an Aufgaben dran ist
  badge: (state) => aufgaben.badge(state),

  render(state, ctx) {
    if (!state.loaded) return loading();
    const cal = state.calendar || { connected: false, events: [], feeds: [] };
    const month = subroute()[0] === 'monat';
    if (!cal.connected) {
      return [
        plannerTabs('kalender'),
        viewHeader({ id: 'title-kalender', title: 'Kalender', subtitle: 'eure Apple-Kalender in der App' }),
        calendarSetup(state, ctx),
      ];
    }
    const names = (cal.feeds || []).map((f) => personById(f.personId)?.name).filter(Boolean);
    return [
      plannerTabs('kalender'),
      viewHeader({ id: 'title-kalender', title: 'Kalender', subtitle: names.length > 1 ? `${names.join(' & ')} zusammen` : `aus ${names[0] || 'Apple'}s Kalender` }),
      toolbar(month, ctx),
      month ? monthView(cal.events, ctx) : weekView(cal.events),
      statusLine(state, cal, ctx),
      ui.manage && calendarSetup(state, ctx, { withSteps: false }),
    ];
  },
};

/** Farbe eines Termins = Farbe der Person (bei beiden: neutral). */
const toneOf = (e) => (e.people?.length === 1 ? personById(e.people[0])?.tone || 4 : 3);
const whoOf = (e) => h('span', { class: 'cal-who' }, (e.people || []).map((id) => avatar(personById(id), { size: 'xs' })));

// ---------- Kopfzeile: Woche/Monat, vor/zurück, Heute ----------
function toolbar(month, ctx) {
  const t = today();
  let label;
  if (month) {
    const first = monthStart(ui.monthOffset);
    label = fmt(first, { month: 'long', year: 'numeric' });
  } else {
    const mon = addDays(mondayOf(t), 7 * ui.weekOffset);
    const sun = addDays(mon, 6);
    // "2.–8. Nov." bzw. über den Monatswechsel "28. Okt. – 3. Nov."
    const sameMonth = fromDay(mon).getMonth() === fromDay(sun).getMonth();
    label = sameMonth
      ? `${fromDay(mon).getDate()}.–${fmt(sun, { day: 'numeric', month: 'short' })}`
      : `${fmt(mon, { day: 'numeric', month: 'short' })} – ${fmt(sun, { day: 'numeric', month: 'short' })}`;
  }
  const step = (dir) => () => {
    if (month) { ui.monthOffset += dir; ui.selectedDay = null; } else ui.weekOffset += dir;
    ctx.rerender();
  };
  const isNow = month ? ui.monthOffset === 0 : ui.weekOffset === 0;
  return h('div', { class: 'cal-bar' },
    h('div', { class: 'segmented cal-bar__mode' },
      h('a', { class: ['segmented__item', !month && 'is-chosen'], href: '#/kalender', 'aria-current': !month ? 'page' : null }, 'Woche'),
      h('a', { class: ['segmented__item', month && 'is-chosen'], href: '#/kalender/monat', 'aria-current': month ? 'page' : null }, 'Monat'),
    ),
    h('div', { class: 'cal-bar__nav' },
      h('button', { type: 'button', class: 'btn btn--icon btn--ghost', 'aria-label': month ? 'Monat davor' : 'Woche davor', 'data-focus-key': 'cal-prev', onclick: step(-1) }, icon('zurueck', { wash: false })),
      h('span', { class: 'cal-bar__label' }, label),
      h('button', { type: 'button', class: 'btn btn--icon btn--ghost', 'aria-label': month ? 'Nächster Monat' : 'Nächste Woche', 'data-focus-key': 'cal-next', onclick: step(1) }, icon('weiter', { wash: false })),
    ),
    h('button', {
      type: 'button', class: 'btn btn--small cal-bar__today', disabled: isNow, 'data-focus-key': 'cal-today',
      onclick: () => { ui.weekOffset = 0; ui.monthOffset = 0; ui.selectedDay = null; ctx.rerender(); },
    }, 'Heute'),
  );
}

// ---------- Woche ----------
function weekView(events) {
  const mon = addDays(mondayOf(today()), 7 * ui.weekOffset);
  const days = Array.from({ length: 7 }, (_, i) => addDays(mon, i));
  return h('div', { class: 'cal-week' }, days.map((day) => {
    const list = eventsOn(events, day);
    const isToday = day === today();
    return h('section', { class: ['cal-day', isToday && 'is-today', list.length === 0 && 'is-empty'], 'aria-label': fmt(day, { weekday: 'long', day: 'numeric', month: 'long' }) },
      h('h3', { class: 'cal-day__head' },
        h('span', { class: 'cal-day__wd' }, fmt(day, { weekday: 'short' })),
        h('span', { class: 'cal-day__date' }, fmt(day, { day: 'numeric' })),
        isToday && h('span', { class: 'cal-day__today' }, 'heute'),
      ),
      list.length
        ? h('ul', { class: 'cal-events' }, list.map((e) => eventItem(e, day)))
        : h('p', { class: 'cal-day__none' }, '–'),
    );
  }));
}

function eventItem(e, day) {
  return h('li', {},
    h('button', { type: 'button', class: ['cal-event', e.allDay && 'cal-event--allday'], 'data-tone': toneOf(e), onclick: () => openEvent(e, day) },
      h('span', { class: 'cal-event__time' }, timeLabel(e, day)),
      h('span', { class: 'cal-event__title' }, e.title),
      e.location && h('span', { class: 'cal-event__place' }, e.location.split('\n')[0]),
      whoOf(e),
    ));
}

// ---------- Monat ----------
function monthStart(offset) {
  const d = fromDay(today());
  return toDay(new Date(d.getFullYear(), d.getMonth() + offset, 1));
}

function monthView(events, ctx) {
  const first = monthStart(ui.monthOffset);
  const m = fromDay(first).getMonth();
  const gridStart = mondayOf(first);
  const weeks = [];
  for (let w = 0; w < 6; w++) {
    const days = Array.from({ length: 7 }, (_, i) => addDays(gridStart, w * 7 + i));
    if (w > 3 && fromDay(days[0]).getMonth() !== m) break; // keine leere letzte Reihe
    weeks.push(days);
  }
  const selected = ui.selectedDay || (ui.monthOffset === 0 ? today() : null);
  const wdNames = Array.from({ length: 7 }, (_, i) => fmt(addDays(gridStart, i), { weekday: 'short' }));
  return h('div', { class: 'cal-month-wrap' },
    h('div', { class: 'cal-month', role: 'grid', 'aria-label': fmt(first, { month: 'long', year: 'numeric' }) },
      h('div', { class: 'cal-month__row cal-month__row--head', role: 'row' }, wdNames.map((n) => h('span', { class: 'cal-month__wd', role: 'columnheader' }, n))),
      weeks.map((days) => h('div', { class: 'cal-month__row', role: 'row' }, days.map((day) => {
        const list = eventsOn(events, day);
        return h('button', {
          type: 'button', role: 'gridcell',
          class: ['cal-cell', fromDay(day).getMonth() !== m && 'is-other', day === today() && 'is-today', day === selected && 'is-selected'],
          'aria-label': `${fmt(day, { weekday: 'long', day: 'numeric', month: 'long' })}: ${list.length ? `${list.length} Termine` : 'keine Termine'}`,
          'aria-pressed': String(day === selected),
          'data-focus-key': `cell-${day}`,
          onclick: () => { ui.selectedDay = day; ctx.rerender(); },
        },
          h('span', { class: 'cal-cell__num' }, fmt(day, { day: 'numeric' })),
          // Handy: Punkte, PC: kurze Titel
          list.length > 0 && h('span', { class: 'cal-cell__dots', 'aria-hidden': 'true' }, list.slice(0, 3).map((e) => h('span', { class: 'cal-cell__dot', 'data-tone': toneOf(e) }))),
          list.length > 0 && h('span', { class: 'cal-cell__titles', 'aria-hidden': 'true' },
            list.slice(0, 3).map((e) => h('span', { class: ['cal-cell__title', e.allDay && 'is-allday'], 'data-tone': toneOf(e) }, e.allDay || dayOf(e.start) !== day ? e.title : `${timeOf(e.start)} ${e.title}`)),
            list.length > 3 && h('span', { class: 'cal-cell__more' }, `+${list.length - 3}`)),
        );
      }))),
    ),
    selected && h('section', { class: 'cal-day cal-day--selected' },
      h('h3', { class: 'cal-day__head' },
        h('span', { class: 'cal-day__wd' }, fmt(selected, { weekday: 'long' })),
        h('span', { class: 'cal-day__date' }, fmt(selected, { day: 'numeric', month: 'long' })),
      ),
      eventsOn(events, selected).length
        ? h('ul', { class: 'cal-events' }, eventsOn(events, selected).map((e) => eventItem(e, selected)))
        : h('p', { class: 'cal-day__none' }, 'Keine Termine'),
    ),
  );
}

// ---------- Termin im Detail ----------
function openEvent(e, day) {
  const close = () => { box.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (ev) => { if (ev.key === 'Escape') close(); };
  const when = e.allDay
    ? (e.start === addDays(e.end, -1) ? fmt(e.start, { weekday: 'long', day: 'numeric', month: 'long' })
      : `${fmt(e.start, { day: 'numeric', month: 'long' })} – ${fmt(addDays(e.end, -1), { day: 'numeric', month: 'long' })}`)
    : `${fmt(dayOf(e.start), { weekday: 'long', day: 'numeric', month: 'long' })}, ${timeOf(e.start)}–${dayOf(e.end) !== dayOf(e.start) ? `${fmt(dayOf(e.end), { day: 'numeric', month: 'short' })} ` : ''}${timeOf(e.end)} Uhr`;
  const box = h('div', {
    class: 'sheet-screen',
    onclick: (ev) => { if (ev.target === ev.currentTarget) close(); },
  },
    h('div', { class: 'card card--note sheet cal-sheet', 'data-tone': toneOf(e), role: 'dialog', 'aria-modal': 'true', 'aria-label': e.title },
      h('div', { class: 'sheet__head' },
        h('h2', { class: 'card__title' }, e.title),
        h('button', { type: 'button', class: 'btn btn--icon btn--ghost', 'aria-label': 'Schließen', onclick: close }, icon('kreuz', { wash: false })),
      ),
      h('p', { class: 'cal-sheet__row' }, icon('kalender', { wash: false }), h('span', {}, when)),
      h('p', { class: 'cal-sheet__row cal-sheet__who' }, whoOf(e),
        h('span', {}, `aus ${(e.people || []).map((id) => personById(id)?.name).filter(Boolean).join(' & ')}s Kalender`.replace(' & ', ' und '))),
      e.location && h('p', { class: 'cal-sheet__row' }, icon('pinnwand', { wash: false }),
        h('a', { href: `https://maps.apple.com/?q=${encodeURIComponent(e.location)}`, target: '_blank', rel: 'noopener' }, e.location)),
      e.notes && h('p', { class: 'cal-sheet__notes' }, e.notes),
      h('p', { class: 'muted cal-sheet__hint' }, 'Ändern geht in der Kalender-App auf dem Handy.'),
    ),
  );
  document.body.append(box);
  document.addEventListener('keydown', onKey);
  box.querySelector('button')?.focus();
  return day;
}

// ---------- Zuletzt aktualisiert / verwalten ----------
function statusLine(state, cal, ctx) {
  const synced = (cal.feeds || []).map((f) => f.syncedAt).filter(Boolean).sort()[0];
  const errors = (cal.feeds || []).filter((f) => f.error);
  const missing = state.people.filter((p) => !(cal.feeds || []).some((f) => f.personId === p.id));
  return h('div', { class: 'cal-status' },
    errors.map((f) => h('p', { class: 'hint cal-status__error' }, `${personById(f.personId)?.name || 'Kalender'}: Letztes Abholen hat nicht geklappt – ${f.error}`)),
    h('span', {}, synced ? `aktualisiert ${formatWhen(synced)} · alle 15 Min. automatisch` : 'noch nicht abgeholt'),
    h('button', {
      type: 'button', class: 'btn btn--small btn--ghost', disabled: ui.syncing, 'data-focus-key': 'cal-sync',
      onclick: async () => {
        ui.syncing = true; ctx.rerender();
        const cal2 = await syncCalendar();
        ui.syncing = false; ctx.rerender();
        if (cal2 && !(cal2.feeds || []).some((f) => f.error)) showToast('Kalender ist aktuell ♡');
      },
    }, iconLabel('wiederholen', ui.syncing ? 'holt …' : 'Jetzt aktualisieren')),
    h('button', {
      type: 'button', class: 'btn btn--small btn--ghost', 'aria-expanded': String(ui.manage), 'data-focus-key': 'cal-manage',
      onclick: () => { ui.manage = !ui.manage; ctx.rerender(); },
    }, missing.length && !ui.manage ? iconLabel('plus', `${missing.map((p) => p.name).join(' & ')}s Kalender verbinden`) : iconLabel('zahnrad', ui.manage ? 'fertig' : 'Kalender verwalten')),
  );
}

// ---------- Einrichten: je Person ein Kalender ----------
const STEPS = () => h('ol', { class: 'cal-steps' },
  h('li', {}, 'Auf dem iPhone die ', h('strong', {}, 'Kalender'), '-App öffnen und unten auf ', h('strong', {}, '„Kalender“'), ' tippen.'),
  h('li', {}, 'Beim eigenen Kalender (den ihr miteinander teilt) auf das ', h('strong', {}, 'ⓘ'), ' rechts tippen.'),
  h('li', {}, 'Ganz unten ', h('strong', {}, '„Öffentlicher Kalender“'), ' einschalten.'),
  h('li', {}, 'Auf ', h('strong', {}, '„Link teilen …“'), ' → ', h('strong', {}, '„Kopieren“'), ' tippen.'),
  h('li', {}, 'Hier beim eigenen Namen einfügen und auf ', h('strong', {}, '„Verbinden“'), ' tippen. Dann macht die andere Person das Gleiche.'),
);

/** Karte mit einer Zeile je Person (verbunden: Name + Ändern/Trennen, sonst: Link einfügen). */
export function calendarSetup(state, ctx, { withSteps = true, scope = 'cal' } = {}) {
  const cal = state.calendar || { feeds: [] };
  return h('section', { class: 'card card--note cal-setup', 'data-tone': 4 },
    h('div', { class: 'card__header' },
      h('span', { class: 'card__icon' }, icon('kalender')),
      h('h2', { class: 'card__title' }, cal.connected ? 'Eure Kalender' : 'Apple-Kalender verbinden'),
    ),
    withSteps ? STEPS() : h('details', { class: 'cal-howto' }, h('summary', {}, 'So bekommt ihr den Link'), STEPS()),
    h('ul', { class: 'cal-people' }, state.people.map((p) => personRow(p, (cal.feeds || []).find((f) => f.personId === p.id), ctx, scope))),
    h('p', { class: 'muted cal-setup__note' }, 'Die Links sind geheim: Sie werden nur auf eurem Server gespeichert und hier nie wieder angezeigt.'),
  );
}

function personRow(person, feed, ctx, scope) {
  const busy = ui.connecting.has(person.id);
  if (feed && !ui.editing.has(person.id)) {
    return h('li', { class: 'cal-person' },
      avatar(person, { size: 'sm' }),
      h('div', { class: 'cal-person__text' },
        h('strong', {}, `${person.name}: „${feed.name || 'Kalender'}“`),
        h('span', { class: 'muted' }, feed.error ? `Fehler: ${feed.error}` : feed.syncedAt ? `verbunden · aktualisiert ${formatWhen(feed.syncedAt)}` : 'verbunden'),
      ),
      h('div', { class: 'cal-person__actions' },
        h('button', { type: 'button', class: 'btn btn--small btn--ghost', 'data-focus-key': `${scope}-change-${person.id}`, onclick: () => { ui.editing.add(person.id); ctx.rerender(); } }, 'Link ändern'),
        h('button', {
          type: 'button', class: 'btn btn--small btn--danger', 'data-focus-key': `${scope}-off-${person.id}`,
          onclick: () => {
            if (confirm(`${person.name}s Kalender trennen? Die Termine verschwinden dann aus der App (im Apple-Kalender bleibt alles).`)) disconnectCalendar(person.id);
          },
        }, 'Trennen'),
      ),
    );
  }
  return h('li', { class: 'cal-person' },
    avatar(person, { size: 'sm' }),
    h('form', {
      class: 'cal-person__form',
      onsubmit: async (e) => {
        e.preventDefault();
        const link = (ui.links[person.id] || '').trim();
        if (!link || busy) return;
        ui.connecting.add(person.id); ctx.rerender();
        try {
          const cal = await connectCalendar(person.id, link);
          ui.links[person.id] = '';
          ui.editing.delete(person.id);
          const f = cal.feeds.find((x) => x.personId === person.id);
          showToast(`${person.name}s Kalender „${f?.name || 'Kalender'}“ ist verbunden ♡`);
        } catch (err) {
          showToast(err.message || 'Verbinden hat nicht geklappt', { variant: 'error' });
        } finally {
          ui.connecting.delete(person.id); ctx.rerender();
        }
      },
    },
      h('label', { class: 'cal-person__label', for: `${scope}-link-${person.id}` }, `Kalender von ${person.name}`),
      h('div', { class: 'add-form add-form--tight' },
        h('input', {
          id: `${scope}-link-${person.id}`, class: 'input', type: 'url', inputmode: 'url', placeholder: 'webcal://p…-caldav.icloud.com/published/2/…',
          autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false',
          'data-focus-key': `${scope}-link-${person.id}`, value: ui.links[person.id] || '',
          oninput: (e) => { ui.links[person.id] = e.target.value; },
        }),
        h('button', { type: 'submit', class: 'btn btn--primary', disabled: busy, 'data-focus-key': `${scope}-connect-${person.id}` }, busy ? 'prüft …' : 'Verbinden'),
        feed && h('button', { type: 'button', class: 'btn btn--ghost', onclick: () => { ui.editing.delete(person.id); ctx.rerender(); } }, 'Abbrechen'),
      ),
    ),
  );
}
