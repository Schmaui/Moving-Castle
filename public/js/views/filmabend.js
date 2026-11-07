// Pinnwand -> Filmabend (/#/pinnwand/filmabend): Merkliste für Filme und Serien im Kino-Look.
//
//   - Merkliste: Kinokarten mit "Wo läuft's?" und "Wer will's sehen?"
//   - "Was gucken wir heute?": Zufall aus der Merkliste (was beide sehen wollen, kommt öfter dran)
//   - Gesehen: jede*r gibt 1–5 Popcorn, die besten stehen oben als "Unsere Lieblinge"
//
// Gespeichert wird auf dem Server (server/modules/movies.js).
import { h, plural, today, shortDate, formatWhen } from '../util.js';
import { viewHeader, iconLabel } from '../ui/components.js';
import { icon } from '../ui/art.js';
import { avatar, byline } from '../ui/people.js';
import { showToast } from '../ui/toast.js';
import { state as store, me, personById, addMovie, updateMovie, deleteMovie, restoreMovie } from '../store.js';

export const SERVICES = [
  { id: 'netflix',   label: 'Netflix' },
  { id: 'prime',     label: 'Prime Video' },
  { id: 'disney',    label: 'Disney+' },
  { id: 'hbo',       label: 'HBO' },
  { id: 'kino',      label: 'Kino' },
  { id: 'sonstiges', label: 'Sonstiges' },
];
const serviceLabel = (id) => SERVICES.find((s) => s.id === id)?.label || '';

const KINDS = [
  { id: 'alle',  label: 'Alles' },
  { id: 'film',  label: 'Filme' },
  { id: 'serie', label: 'Serien' },
];

const LOVED = 4;        // ab diesem Schnitt ist es ein "Liebling"
const SEEN_SHORT = 6;   // so viele "Gesehen" zeigen, bevor "Alle zeigen" kommt

// Zustand nur dieser Ansicht (bleibt beim Neuzeichnen erhalten)
const ui = {
  filter: 'alle',
  draft: null,          // Formular: neuer bzw. bearbeiteter Eintrag
  editingId: null,      // null = neu (wenn draft gesetzt)
  rateId: null,         // bei welchem Film gerade "Wie war's?" offen ist
  rateDraft: {},        // { personId: 1..5 }
  pickId: null,         // Ergebnis von "Was gucken wir heute?"
  shuffling: false,
  showAllSeen: false,
  busy: false,
};

// ---------- Hilfen ----------
const wanted = (m) => (m.wantedBy || []).filter((id) => personById(id));
const ratingsOf = (m) => Object.entries(m.ratings || {}).map(([id, n]) => ({ person: personById(Number(id)), n })).filter((r) => r.person);
function average(m) {
  const r = ratingsOf(m);
  return r.length ? r.reduce((s, x) => s + x.n, 0) / r.length : null;
}
const formatAvg = (avg) => avg.toLocaleString('de-DE', { maximumFractionDigits: 1 });
const matchesFilter = (m) => ui.filter === 'alle' || m.kind === ui.filter;
const everyoneWants = (m, people) => people.length > 1 && people.every((p) => wanted(m).includes(p.id));

/** Infos für die Kachel auf der Pinnwand-Übersicht. */
export function filmTile(state) {
  const movies = state.movies || [];
  const open = movies.filter((m) => !m.seenOn).length;
  const seen = movies.length - open;
  return {
    id: 'filmabend', title: 'Filmabend', icon: 'popcorn', tone: 2,
    info: open ? `${plural(open, 'Titel', 'Titel')} auf der Liste` : 'noch leer',
    meta: seen ? `${seen} gesehen` : 'Was gucken wir heute?',
  };
}

// =====================================================================
// Seite
// =====================================================================
export function filmabendPage(state, ctx, backLink) {
  const movies = state.movies || [];
  const people = state.people || [];
  const watchlist = movies.filter((m) => !m.seenOn && matchesFilter(m))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const seen = movies.filter((m) => m.seenOn && matchesFilter(m));
  const loved = seen.filter((m) => (average(m) ?? 0) >= LOVED)
    .sort((a, b) => average(b) - average(a) || b.seenOn.localeCompare(a.seenOn));
  const rest = seen.filter((m) => !loved.includes(m)).sort((a, b) => b.seenOn.localeCompare(a.seenOn));
  const restShown = ui.showAllSeen ? rest : rest.slice(0, SEEN_SHORT);
  const picked = ui.pickId ? movies.find((m) => m.id === ui.pickId && !m.seenOn) : null;
  const creating = ui.draft && ui.editingId == null;

  return [
    backLink,
    viewHeader({
      id: 'title-pinnwand', title: 'Filmabend', subtitle: 'Filme & Serien, die ihr zusammen gucken wollt',
      actions: [!creating && h('button', {
        type: 'button', class: 'btn btn--primary', 'data-focus-key': 'film-new',
        onclick: () => startCreate(ctx),
      }, iconLabel('plus', 'Film oder Serie'))],
    }),
    h('div', { class: 'cinema' },
      h('div', { class: 'cinema__curtain', 'aria-hidden': 'true' }),

      creating && h('div', { class: 'cinema__form' }, movieForm(null, people, ctx)),

      // Was gucken wir heute?
      h('div', { class: 'cinema__marquee' },
        h('button', {
          type: 'button', class: 'marquee', 'data-focus-key': 'film-pick', disabled: ui.shuffling,
          onclick: () => pickRandom(ctx),
        },
          h('span', { class: 'marquee__icon' }, icon('wuerfel', { wash: false })),
          h('span', { class: 'marquee__text' }, 'Was gucken wir heute?'),
        ),
        h('div', { class: 'pills cinema__filter', role: 'group', 'aria-label': 'Filme oder Serien' }, KINDS.map((k) => h('button', {
          type: 'button', class: ['pill', ui.filter === k.id && 'is-chosen'], 'aria-pressed': String(ui.filter === k.id),
          'data-focus-key': `film-filter-${k.id}`,
          onclick: () => { ui.filter = k.id; ui.pickId = null; ctx.rerender(); },
        }, k.label))),
      ),
      picked && pickResult(picked, people, ctx),

      // Merkliste
      h('h2', { class: 'cinema__heading' }, 'Merkliste', watchlist.length > 0 && h('span', { class: 'cinema__count' }, watchlist.length)),
      watchlist.length
        ? h('div', { class: 'tickets' }, watchlist.map((m) => ticket(m, people, ctx)))
        : h('p', { class: 'cinema__empty' }, ui.filter === 'alle'
          ? 'Noch nichts auf der Liste – oben „Film oder Serie“ antippen.'
          : `Keine ${ui.filter === 'film' ? 'Filme' : 'Serien'} auf der Liste.`),

      // Gesehen
      loved.length > 0 && [
        h('h2', { class: 'cinema__heading' }, icon('herz', { wash: false }), 'Unsere Lieblinge'),
        h('div', { class: 'tickets' }, loved.map((m) => ticket(m, people, ctx))),
      ],
      rest.length > 0 && [
        h('h2', { class: 'cinema__heading' }, 'Gesehen'),
        h('div', { class: 'tickets' }, restShown.map((m) => ticket(m, people, ctx))),
        rest.length > SEEN_SHORT && h('button', {
          type: 'button', class: 'btn btn--ghost cinema__more', 'data-focus-key': 'film-more',
          onclick: () => { ui.showAllSeen = !ui.showAllSeen; ctx.rerender(); },
        }, ui.showAllSeen ? 'Weniger zeigen' : `Alle ${rest.length} zeigen`),
      ],
    ),
  ];
}

// =====================================================================
// Zufall
// =====================================================================
function pickRandom(ctx) {
  const people = store.people || [];
  const pool = (store.movies || []).filter((m) => !m.seenOn && matchesFilter(m));
  if (!pool.length) {
    showToast(ui.filter === 'alle' ? 'Die Merkliste ist noch leer' : `Keine ${ui.filter === 'film' ? 'Filme' : 'Serien'} auf der Merkliste`, { variant: 'error' });
    return;
  }
  // Was alle sehen wollen, kommt doppelt so oft dran. Nicht zweimal hintereinander dasselbe.
  const weighted = pool.flatMap((m) => (everyoneWants(m, people) ? [m, m] : [m]));
  const choices = pool.length > 1 ? weighted.filter((m) => m.id !== ui.pickId) : weighted;
  const final = choices[Math.floor(Math.random() * choices.length)];

  const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (calm || pool.length === 1) {
    ui.pickId = final.id;
    ctx.rerender();
    return;
  }
  // Kurzes "Trommelwirbel"-Durchblättern, dann steht es fest
  ui.shuffling = true;
  let step = 0;
  const steps = 9;
  const tick = () => {
    step++;
    ui.pickId = step < steps ? pool[Math.floor(Math.random() * pool.length)].id : final.id;
    if (step >= steps) ui.shuffling = false;
    ctx.rerender();
    if (step < steps) setTimeout(tick, 60 + step * 18);
  };
  tick();
}

function pickResult(movie, people, ctx) {
  return h('section', { class: ['pick', ui.shuffling && 'is-shuffling'], 'aria-live': 'polite' },
    h('p', { class: 'pick__label' }, ui.shuffling ? 'Trommelwirbel …' : 'Heute läuft:'),
    ticket(movie, people, ctx, { big: true }),
    !ui.shuffling && h('div', { class: 'pick__actions' },
      h('button', {
        type: 'button', class: 'btn btn--small', 'data-focus-key': 'film-pick-again',
        onclick: () => pickRandom(ctx),
      }, iconLabel('wuerfel', 'Nochmal')),
      h('button', {
        type: 'button', class: 'btn btn--ghost btn--small pick__close', 'data-focus-key': 'film-pick-close',
        onclick: () => { ui.pickId = null; ctx.rerender(); },
      }, 'Schließen'),
    ),
  );
}

// =====================================================================
// Kinokarte
// =====================================================================
function ticket(movie, people, ctx, { big = false } = {}) {
  if (!big && ui.editingId === movie.id && ui.draft) {
    return h('div', { class: 'cinema__form' }, movieForm(movie, people, ctx));
  }
  const mine = me();
  const wants = wanted(movie);
  const iWant = mine && wants.includes(mine.id);
  const avg = average(movie);
  const rating = ui.rateId === movie.id && !big;
  const keyBase = `film-${big ? 'pick' : 'm'}-${movie.id}`;

  return h('article', {
    class: ['ticket', big && 'ticket--big', movie.seenOn && 'ticket--seen'],
    'data-service': movie.service || 'keiner',
  },
    h('div', { class: 'ticket__stub', 'aria-hidden': 'true' },
      icon(movie.kind === 'serie' ? 'filmklappe' : 'popcorn', { wash: false }),
      h('span', { class: 'ticket__kind' }, movie.kind === 'serie' ? 'Serie' : 'Film'),
    ),
    h('div', { class: 'ticket__main' },
      h('div', { class: 'ticket__top' },
        h('h3', { class: 'ticket__title' }, movie.title),
        !big && h('button', {
          type: 'button', class: 'btn btn--icon btn--ghost ticket__edit', 'aria-label': `${movie.title} bearbeiten`, title: 'Bearbeiten',
          'data-focus-key': `${keyBase}-edit`,
          onclick: () => startEdit(movie, ctx),
        }, icon('stift', { wash: false })),
      ),
      h('p', { class: 'ticket__meta' },
        h('span', { class: 'visually-hidden' }, movie.kind === 'serie' ? 'Serie' : 'Film'),
        movie.service && h('span', { class: 'service', 'data-service': movie.service }, serviceLabel(movie.service)),
        movie.seenOn && h('span', { class: 'ticket__date' }, `gesehen ${shortDate(movie.seenOn)}`),
        avg != null && h('span', { class: 'ticket__avg', title: 'Euer Schnitt' }, icon('popcorn', { wash: false }), `Ø ${formatAvg(avg)}`),
      ),
      movie.note && h('p', { class: 'ticket__note' }, movie.note),

      // Merkliste: wer will's sehen?
      !movie.seenOn && h('div', { class: 'ticket__who' },
        wants.length > 0 && h('span', { class: 'ticket__avatars', title: 'Will sehen' },
          wants.map((id) => avatar(personById(id), { size: 'xs', label: true }))),
        everyoneWants(movie, people) && h('span', { class: 'ticket__both' }, 'Beide wollen ♡'),
        mine && !big && h('button', {
          type: 'button', class: ['pill', 'pill--small', iWant && 'is-chosen'], 'aria-pressed': String(Boolean(iWant)),
          'data-focus-key': `${keyBase}-want`,
          onclick: () => {
            const next = iWant ? wants.filter((id) => id !== mine.id) : [...wants, mine.id];
            updateMovie(movie, { wantedBy: next });
          },
        }, iWant ? 'Will ich ✓' : 'Will ich auch'),
      ),

      // Gesehen: Popcorn von jedem
      movie.seenOn && !rating && h('div', { class: 'ratings' }, people.map((p) => ratingRow(p, movie.ratings?.[p.id] || 0, `${keyBase}-r${p.id}`,
        (n) => {
          const ratings = { ...(movie.ratings || {}) };
          if (n) ratings[p.id] = n; else delete ratings[p.id];
          updateMovie(movie, { ratings });
        }))),

      // Merkliste: "Gesehen" -> Wie war's?
      rating && ratePanel(movie, people, ctx),
      !movie.seenOn && !rating && h('div', { class: 'ticket__actions' },
        h('button', {
          type: 'button', class: 'btn btn--small ticket__seen', 'data-focus-key': `${keyBase}-seen`,
          onclick: () => {
            ui.rateId = movie.id;
            ui.rateDraft = {};
            if (big) ui.pickId = null; // Ergebnis zu, Bewertung an der Karte in der Liste
            ctx.rerender();
            requestAnimationFrame(() => document.querySelector(`[data-focus-key="film-m-${movie.id}-rate-save"]`)?.closest('.ticket')?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
          },
        }, iconLabel('haken', 'Gesehen')),
      ),
    ),
  );
}

/** Eine Reihe Popcorn für eine Person (antippen = bewerten, nochmal antippen = zurücknehmen). */
function ratingRow(person, value, key, onRate) {
  return h('div', { class: 'rating', role: 'group', 'aria-label': `Bewertung von ${person.name}` },
    avatar(person, { size: 'xs' }),
    h('span', { class: 'rating__name' }, person.name),
    h('span', { class: 'rating__corn' }, [1, 2, 3, 4, 5].map((n) => h('button', {
      type: 'button', class: ['corn', n <= value && 'is-on'],
      'aria-label': `${n} von 5 Popcorn`, 'aria-pressed': String(n === value), title: `${n} von 5`,
      'data-focus-key': `${key}-${n}`,
      onclick: () => onRate(n === value ? 0 : n),
    }, icon('popcorn')))),
  );
}

function ratePanel(movie, people, ctx) {
  const close = () => { ui.rateId = null; ui.rateDraft = {}; ctx.rerender(); };
  return h('div', { class: 'rate-panel' },
    h('p', { class: 'rate-panel__title' }, 'Wie war’s?'),
    people.map((p) => ratingRow(p, ui.rateDraft[p.id] || 0, `film-m-${movie.id}-d${p.id}`, (n) => {
      if (n) ui.rateDraft[p.id] = n; else delete ui.rateDraft[p.id];
      ctx.rerender();
    })),
    h('p', { class: 'rate-panel__hint' }, 'Geht auch später noch.'),
    h('div', { class: 'add-form' },
      h('button', {
        type: 'button', class: 'btn btn--primary btn--small', 'data-focus-key': `film-m-${movie.id}-rate-save`,
        onclick: async () => {
          const ratings = { ...ui.rateDraft };
          ui.rateId = null;
          ui.rateDraft = {};
          const ok = await updateMovie(movie, { seenOn: today(), ratings });
          if (ok) showToast(`„${movie.title}“ ist bei Gesehen ♡`, { actionLabel: 'Rückgängig', onAction: () => updateMovie(movie, { seenOn: null, ratings: movie.ratings }) });
        },
      }, 'Gesehen ✓'),
      h('button', { type: 'button', class: 'btn btn--ghost btn--small', onclick: close }, 'Abbrechen'),
    ),
  );
}

// =====================================================================
// Formular (neu + bearbeiten)
// =====================================================================
function startCreate(ctx) {
  const mine = me();
  ui.editingId = null;
  ui.rateId = null;
  ui.draft = { title: '', kind: 'film', service: null, note: '', wantedBy: mine ? [mine.id] : [] };
  ctx.rerender();
  focusLater('[data-focus-key="film-form-title"]');
}

function startEdit(movie, ctx) {
  ui.editingId = movie.id;
  ui.rateId = null;
  ui.draft = { title: movie.title, kind: movie.kind, service: movie.service, note: movie.note || '', wantedBy: [...wanted(movie)] };
  ctx.rerender();
  focusLater('[data-focus-key="film-form-title"]');
}

function closeForm(ctx) {
  ui.draft = null;
  ui.editingId = null;
  ctx.rerender();
}

function movieForm(movie, people, ctx) {
  const d = ui.draft;
  const legend = (text) => h('legend', { class: 'choice__legend' }, text);
  const pill = (chosen, label, key, onclick, extra) => h('button', {
    type: 'button', class: ['pill', chosen && 'is-chosen'], 'aria-pressed': String(chosen), 'data-focus-key': key, onclick,
  }, extra, label);

  return h('form', {
    class: 'card card--note film-form', 'data-tone': 2,
    onsubmit: (e) => { e.preventDefault(); saveMovie(movie, ctx); },
    onkeydown: (e) => { if (e.key === 'Escape') closeForm(ctx); },
  },
    h('div', { class: 'card__header' },
      h('span', { class: 'card__icon' }, icon('popcorn')),
      h('h2', { class: 'card__title' }, movie ? 'Bearbeiten' : 'Neu auf die Merkliste'),
    ),
    h('label', { class: 'choice' },
      h('span', { class: 'choice__legend' }, 'Titel'),
      h('input', {
        class: 'input', type: 'text', maxlength: 120, autocomplete: 'off', enterkeyhint: 'done',
        placeholder: 'z. B. Das wandelnde Schloss', 'data-focus-key': 'film-form-title', value: d.title,
        oninput: (e) => { d.title = e.target.value; },
      }),
    ),
    h('fieldset', { class: 'choice' },
      legend('Film oder Serie?'),
      h('div', { class: 'pills' },
        pill(d.kind === 'film', 'Film', 'film-form-kind-film', () => { d.kind = 'film'; ctx.rerender(); }),
        pill(d.kind === 'serie', 'Serie', 'film-form-kind-serie', () => { d.kind = 'serie'; ctx.rerender(); }),
      ),
    ),
    h('fieldset', { class: 'choice' },
      legend('Wo läuft’s?'),
      h('div', { class: 'pills' }, SERVICES.map((s) => pill(d.service === s.id, s.label, `film-form-service-${s.id}`,
        () => { d.service = d.service === s.id ? null : s.id; ctx.rerender(); }))),
    ),
    people.length > 0 && h('fieldset', { class: 'choice' },
      legend('Wer will’s sehen?'),
      h('div', { class: 'pills' }, people.map((p) => {
        const on = d.wantedBy.includes(p.id);
        return pill(on, p.name, `film-form-want-${p.id}`, () => {
          d.wantedBy = on ? d.wantedBy.filter((id) => id !== p.id) : [...d.wantedBy, p.id];
          ctx.rerender();
        }, avatar(p, { size: 'xs' }));
      })),
    ),
    h('label', { class: 'choice' },
      h('span', { class: 'choice__legend' }, 'Notiz (optional)'),
      h('input', {
        class: 'input', type: 'text', maxlength: 300, autocomplete: 'off',
        placeholder: 'z. B. Tipp von Lea, Teil 2 zuerst', 'data-focus-key': 'film-form-note', value: d.note,
        oninput: (e) => { d.note = e.target.value; },
      }),
    ),
    h('div', { class: 'add-form' },
      h('button', { type: 'submit', class: 'btn btn--primary', 'data-focus-key': 'film-form-save', disabled: ui.busy }, movie ? 'Speichern' : 'Auf die Liste'),
      h('button', { type: 'button', class: 'btn btn--ghost', onclick: () => closeForm(ctx) }, 'Abbrechen'),
      movie?.seenOn && h('button', {
        type: 'button', class: 'btn btn--ghost', 'data-focus-key': 'film-form-unseen',
        onclick: () => {
          closeForm(ctx);
          updateMovie(movie, { seenOn: null });
          showToast(`„${movie.title}“ ist wieder auf der Merkliste`);
        },
      }, 'Zurück auf die Merkliste'),
      movie && h('button', {
        type: 'button', class: 'btn btn--icon btn--danger pin-form__delete', 'aria-label': 'Löschen', title: 'Löschen',
        'data-focus-key': 'film-form-delete',
        onclick: () => {
          closeForm(ctx);
          if (ui.pickId === movie.id) ui.pickId = null;
          deleteMovie(movie);
          showToast(`„${movie.title}“ gelöscht`, { actionLabel: 'Rückgängig', onAction: () => restoreMovie(movie) });
        },
      }, icon('muell', { wash: false })),
    ),
    movie?.addedBy && h('p', { class: 'task-edit__by' }, byline(movie.addedBy, `eingetragen ${formatWhen(movie.createdAt)}`)),
  );
}

async function saveMovie(movie, ctx) {
  const d = ui.draft;
  const title = d.title.trim();
  if (!title) {
    focusLater('[data-focus-key="film-form-title"]');
    showToast('Bitte einen Titel eintragen', { variant: 'error' });
    return;
  }
  const data = { title, kind: d.kind, service: d.service, note: d.note.trim() || null, wantedBy: d.wantedBy };
  ui.busy = true;
  ctx.rerender();
  const saved = movie ? await updateMovie(movie, data) : await addMovie(data);
  ui.busy = false;
  if (!saved) { ctx.rerender(); return; }
  closeForm(ctx);
  showToast(movie ? 'Gespeichert ♡' : `„${title}“ steht auf der Merkliste ♡`);
}

function focusLater(selector) {
  requestAnimationFrame(() => document.querySelector(selector)?.focus({ preventScroll: true }));
}
