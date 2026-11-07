// Ansicht "Kalender" (/#/kalender): euer gemeinsamer Apple-Kalender, nur zum Anschauen.
//   #/kalender         Woche (mit Uhrzeiten)
//   #/kalender/monat   Monat (Tag antippen zeigt die Termine darunter)
// Liegt in der Leiste unter "Planer" (Reiter oben: Kalender · Aufgaben).
// Die Termine holt der Server alle 15 Minuten aus dem "Öffentlichen Kalender" von Apple
// (server/modules/calendar.js). Eintragen/Ändern weiter in der Kalender-App.
import { h, today, addDays, mondayOf, formatWhen } from '../util.js';
import { viewHeader, loading, iconLabel, plannerTabs } from '../ui/components.js';
import { icon } from '../ui/art.js';
import { showToast } from '../ui/toast.js';
import { connectCalendar, syncCalendar } from '../store.js';
import aufgaben from './aufgaben.js';

const subroute = () => location.hash.replace(/^#\/?/, '').split(/[/?]/).slice(1);

// Zustand nur dieser Ansicht
const ui = {
  weekOffset: 0,
  monthOffset: 0,
  selectedDay: null,   // Monat: angetippter Tag
  link: '',            // Eingabe beim Verbinden
  connecting: false,
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
    const cal = state.calendar || { connected: false, events: [] };
    const month = subroute()[0] === 'monat';
    if (!cal.connected) {
      return [plannerTabs('kalender'), viewHeader({ id: 'title-kalender', title: 'Kalender', subtitle: 'euer Apple-Kalender in der App' }), setupCard(ctx)];
    }
    return [
      plannerTabs('kalender'),
      viewHeader({ id: 'title-kalender', title: 'Kalender', subtitle: cal.name ? `„${cal.name}“ aus Apple-Kalender` : 'aus Apple-Kalender' }),
      toolbar(month, ctx),
      month ? monthView(cal.events, ctx) : weekView(cal.events),
      statusLine(cal, ctx),
    ];
  },
};

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
    h('button', { type: 'button', class: ['cal-event', e.allDay && 'cal-event--allday'], onclick: () => openEvent(e, day) },
      h('span', { class: 'cal-event__time' }, timeLabel(e, day)),
      h('span', { class: 'cal-event__title' }, e.title),
      e.location && h('span', { class: 'cal-event__place' }, e.location.split('\n')[0]),
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
          list.length > 0 && h('span', { class: 'cal-cell__dots', 'aria-hidden': 'true' }, list.slice(0, 3).map(() => h('span', { class: 'cal-cell__dot' }))),
          list.length > 0 && h('span', { class: 'cal-cell__titles', 'aria-hidden': 'true' },
            list.slice(0, 3).map((e) => h('span', { class: ['cal-cell__title', e.allDay && 'is-allday'] }, e.allDay || dayOf(e.start) !== day ? e.title : `${timeOf(e.start)} ${e.title}`)),
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
    h('div', { class: 'card card--note sheet cal-sheet', 'data-tone': 4, role: 'dialog', 'aria-modal': 'true', 'aria-label': e.title },
      h('div', { class: 'sheet__head' },
        h('h2', { class: 'card__title' }, e.title),
        h('button', { type: 'button', class: 'btn btn--icon btn--ghost', 'aria-label': 'Schließen', onclick: close }, icon('kreuz', { wash: false })),
      ),
      h('p', { class: 'cal-sheet__row' }, icon('kalender', { wash: false }), h('span', {}, when)),
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

// ---------- Zuletzt aktualisiert ----------
function statusLine(cal, ctx) {
  return h('div', { class: 'cal-status' },
    cal.error && h('p', { class: 'hint cal-status__error' }, `Letztes Abholen hat nicht geklappt: ${cal.error}`),
    h('span', {}, cal.syncedAt ? `aktualisiert ${formatWhen(cal.syncedAt)} · alle 15 Min. automatisch` : 'noch nicht abgeholt'),
    h('button', {
      type: 'button', class: 'btn btn--small btn--ghost', disabled: ui.syncing, 'data-focus-key': 'cal-sync',
      onclick: async () => {
        ui.syncing = true; ctx.rerender();
        const cal2 = await syncCalendar();
        ui.syncing = false; ctx.rerender();
        if (cal2 && !cal2.error) showToast('Kalender ist aktuell ♡');
      },
    }, iconLabel('wiederholen', ui.syncing ? 'holt …' : 'Jetzt aktualisieren')),
  );
}

// ---------- Einrichten (einmalig) ----------
export function setupCard(ctx, { compact = false, onDone } = {}) {
  return h('section', { class: 'card card--note cal-setup', 'data-tone': 4 },
    h('div', { class: 'card__header' },
      h('span', { class: 'card__icon' }, icon('kalender')),
      h('h2', { class: 'card__title' }, 'Apple-Kalender verbinden'),
    ),
    !compact && h('ol', { class: 'cal-steps' },
      h('li', {}, 'Auf dem iPhone die ', h('strong', {}, 'Kalender'), '-App öffnen und unten auf ', h('strong', {}, '„Kalender“'), ' tippen.'),
      h('li', {}, 'Beim gemeinsamen Kalender auf das ', h('strong', {}, 'ⓘ'), ' rechts tippen.'),
      h('li', {}, 'Ganz unten ', h('strong', {}, '„Öffentlicher Kalender“'), ' einschalten (geht nur bei der Person, die den Kalender angelegt hat).'),
      h('li', {}, 'Auf ', h('strong', {}, '„Link teilen …“'), ' → ', h('strong', {}, '„Kopieren“'), ' tippen.'),
      h('li', {}, 'Hier unten einfügen und auf ', h('strong', {}, '„Verbinden“'), ' tippen.'),
    ),
    h('p', { class: 'muted cal-setup__note' }, 'Der Link ist geheim: Er wird nur auf eurem Server gespeichert und hier nie wieder angezeigt.'),
    h('form', {
      class: 'add-form',
      onsubmit: async (e) => {
        e.preventDefault();
        if (!ui.link.trim() || ui.connecting) return;
        ui.connecting = true; ctx.rerender();
        try {
          const cal = await connectCalendar(ui.link.trim());
          ui.link = '';
          onDone?.();
          showToast(`Verbunden mit „${cal.name || 'Kalender'}“ ♡`);
        } catch (err) {
          showToast(err.message || 'Verbinden hat nicht geklappt', { variant: 'error' });
        } finally {
          ui.connecting = false; ctx.rerender();
        }
      },
    },
      h('input', {
        class: 'input', type: 'url', inputmode: 'url', placeholder: 'webcal://p…-caldav.icloud.com/published/2/…',
        'aria-label': 'Link zum öffentlichen Kalender', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false',
        'data-focus-key': 'cal-link', value: ui.link,
        oninput: (e) => { ui.link = e.target.value; },
      }),
      h('button', { type: 'submit', class: 'btn btn--primary', disabled: ui.connecting, 'data-focus-key': 'cal-connect' }, ui.connecting ? 'prüft …' : 'Verbinden'),
    ),
  );
}
