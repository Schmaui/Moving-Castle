// Ansicht "Kochen" (/#/kochen): Wochenplan, Rezepte, Lieblingsgerichte.
//
//   #/kochen                     Wochenplan (Abendessen, pro Abend 2 Vorschläge)
//   #/kochen/rezepte             alle Rezepte (was ihr gerade kochen könnt, steht oben)
//   #/kochen/lieblinge           Lieblingsgerichte (Herz)
//   #/kochen/rezept/12           ein Rezept: Zutaten mit Vorrat-Abgleich, Schritte, Notizen
//   #/kochen/neu                 neues Rezept (per Link holen oder selbst schreiben)
//   #/kochen/rezept/12/bearbeiten
//
// Der Abgleich mit dem Vorrat steckt in js/recipes.js.
import { h, today, addDays, formatWhen, weekdayLong, weekday, shortDate, mondayOf } from '../util.js';
import { viewHeader, emptyState, loading, iconLabel } from '../ui/components.js';
import { icon } from '../ui/art.js';
import { avatar } from '../ui/people.js';
import { showToast } from '../ui/toast.js';
import {
  parseIngredient, ingredientText, recipeStatus, deductionPlan, formatQty, formatMinutes, onWishlist,
} from '../recipes.js';
import {
  personById, recipeById, addRecipe, updateRecipe, deleteRecipe, importRecipe, cookRecipe, linkIngredient,
  addMeal, deleteMeal, chooseMeal, addWish, setMissing,
} from '../store.js';

// Zustand nur dieser Ansicht (bleibt beim Neuzeichnen erhalten)
const ui = {
  weekOffset: 0,     // 0 = diese Woche, 1 = nächste …
  showPast: false,   // vergangene Tage dieser Woche zeigen
  search: '',
  tag: null,         // Filter nach Schlagwort
  picker: null,      // { day, slot } – Auswahl "Was gibt's?"
  pickerSearch: '',
  pickerText: '',
  cook: null,        // { recipe, meal, entries } – Dialog nach dem Kochen
  form: null,        // Entwurf beim Anlegen/Bearbeiten
  notes: {},         // angefangene Notizen
};

/** Unterseite aus der Adresse, z. B. ['rezept', '12', 'bearbeiten'] */
const subroute = () => location.hash.replace(/^#\/?/, '').split(/[/?]/).slice(1);
const go = (path) => { location.hash = `#/kochen${path ? `/${path}` : ''}`; };

export default {
  id: 'kochen',
  label: 'Kochen',
  icon: 'topf',

  render(state, ctx) {
    if (!state.loaded) return loading();
    const [section, id, action] = subroute();
    let content;
    if (section === 'rezept' && id) {
      const recipe = recipeById(id);
      if (!recipe) content = [viewHeader({ id: 'title-kochen', title: 'Rezept nicht gefunden' }), backLink()];
      else content = action === 'bearbeiten' ? formView(state, ctx, recipe) : detailView(state, ctx, recipe);
    } else if (section === 'neu') {
      content = formView(state, ctx, null);
    } else {
      const tab = section === 'rezepte' || section === 'lieblinge' ? section : 'woche';
      content = [
        viewHeader({ id: 'title-kochen', title: 'Kochen', subtitle: subtitle(state, tab) }),
        tabs(tab),
        tab === 'woche' ? weekView(state, ctx) : listView(state, ctx, tab),
      ];
    }
    return [content, ui.picker && pickerDialog(state, ctx), ui.cook && cookDialog(ctx)].flat(Infinity);
  },
};

function subtitle(state, tab) {
  if (tab === 'woche') {
    const meal = todaysMeal(state);
    return meal ? `Heute gibt’s ${mealTitle(meal)}` : 'Was gibt’s diese Woche?';
  }
  const n = (state.recipes || []).filter((r) => tab !== 'lieblinge' || r.favorite).length;
  return tab === 'lieblinge' ? `${n} Lieblingsgerichte` : `${n} Rezepte`;
}

function tabs(active) {
  const tab = (id, label, path) => h('a', {
    class: ['pill', active === id && 'is-chosen'],
    href: `#/kochen${path}`,
    'aria-current': active === id ? 'page' : null,
  }, label);
  return h('nav', { class: 'pills pills--filter', 'aria-label': 'Kochen' },
    tab('woche', 'Woche', ''),
    tab('rezepte', 'Rezepte', '/rezepte'),
    tab('lieblinge', 'Lieblinge', '/lieblinge'),
    h('a', { class: 'btn btn--primary btn--small pills__end', href: '#/kochen/neu' }, iconLabel('plus', 'Neues Rezept')),
  );
}

// =====================================================================
// Wochenplan
// =====================================================================
function weekView(state, ctx) {
  const monday = addDays(mondayOf(today()), 7 * ui.weekOffset);
  const sunday = addDays(monday, 6);
  const label = ui.weekOffset === 0 ? 'diese Woche' : ui.weekOffset === 1 ? 'nächste Woche'
    : ui.weekOffset === -1 ? 'letzte Woche' : `${shortDate(monday)} – ${shortDate(sunday)}`;
  const nav = h('div', { class: 'week-nav' },
    h('button', {
      type: 'button', class: 'btn btn--icon btn--ghost', 'aria-label': 'Woche davor', 'data-focus-key': 'week-prev',
      disabled: ui.weekOffset <= -1, onclick: () => { ui.weekOffset--; ctx.rerender(); },
    }, icon('zurueck', { wash: false })),
    h('span', { class: 'week-nav__label' }, label, h('small', {}, ` ${shortDate(monday)} – ${shortDate(sunday)}`)),
    h('button', {
      type: 'button', class: 'btn btn--icon btn--ghost', 'aria-label': 'Nächste Woche', 'data-focus-key': 'week-next',
      disabled: ui.weekOffset >= 3, onclick: () => { ui.weekOffset++; ctx.rerender(); },
    }, icon('weiter', { wash: false })),
  );
  const all = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  // diese Woche: vergangene Tage erst auf Wunsch (sonst muss man am Handy weit scrollen)
  const past = ui.weekOffset === 0 ? all.filter((d) => d < today()) : [];
  const days = ui.showPast ? all : all.filter((d) => !past.includes(d));
  const pastToggle = past.length > 0 && h('button', {
    type: 'button', class: 'pill past-toggle', 'data-focus-key': 'past-toggle', 'aria-expanded': String(ui.showPast),
    onclick: () => { ui.showPast = !ui.showPast; ctx.rerender(); },
  }, ui.showPast ? 'vergangene Tage ausblenden' : `${weekday(past[0])}–${weekday(past[past.length - 1])} zeigen`);
  return [nav, pastToggle, h('div', { class: 'cards cards--grid' }, days.map((day) => dayCard(state, ctx, day, all.indexOf(day))))];
}

function dayCard(state, ctx, day, i) {
  const isToday = day === today();
  const past = day < today();
  return h('section', {
    class: ['card', 'card--note', 'day-card', isToday && 'is-today', past && 'is-past'],
    'data-tone': (i % 6) + 1,
    'aria-label': `${weekdayLong(day)} ${shortDate(day)}`,
  },
    h('div', { class: 'day-card__head' },
      h('h2', { class: 'card__title' }, weekdayLong(day)),
      h('span', { class: 'card__meta' }, isToday ? 'heute' : shortDate(day)),
    ),
    [1, 2].map((slot) => mealSlot(state, ctx, day, slot)),
  );
}

function mealSlot(state, ctx, day, slot) {
  const meal = (state.meals || []).find((m) => m.day === day && m.slot === slot);
  if (!meal) {
    return h('button', {
      type: 'button', class: 'slot-add', 'data-focus-key': `add-${day}-${slot}`,
      onclick: () => { ui.picker = { day, slot }; ui.pickerSearch = ''; ui.pickerText = ''; ctx.rerender(); focusLater('[data-focus-key="picker-search"]'); },
    }, icon('plus', { wash: false }), slot === 1 ? 'Vorschlag' : 'zweiter Vorschlag');
  }
  const recipe = meal.recipeId ? recipeById(meal.recipeId) : null;
  const other = (state.meals || []).find((m) => m.day === day && m.id !== meal.id);
  const status = recipe && recipeStatus(recipe, state);
  const canCook = meal.chosen && !meal.cooked && day <= today();
  return h('div', { class: ['meal', meal.chosen && 'is-chosen', other?.chosen && !meal.chosen && 'is-other', meal.cooked && 'is-cooked'] },
    h('div', { class: 'meal__text' },
      recipe
        ? h('a', { class: 'meal__title', href: `#/kochen/rezept/${recipe.id}` }, recipe.title)
        : h('span', { class: 'meal__title' }, meal.title),
      status && statusLine(status, true),
    ),
    h('div', { class: 'meal__actions' },
      meal.cooked
        ? h('span', { class: 'meal__done' }, icon('haken', { wash: false }), 'gekocht')
        : h('button', {
          type: 'button', class: ['pill', meal.chosen && 'is-chosen'], 'aria-pressed': String(meal.chosen),
          'data-focus-key': `choose-${meal.id}`, onclick: () => chooseMeal(meal),
        }, meal.chosen ? 'Das gibt’s ♡' : 'Das gibt’s'),
      canCook && h('button', {
        type: 'button', class: 'pill pill--cook', 'data-focus-key': `cook-${meal.id}`,
        onclick: () => openCook(state, ctx, recipe, meal),
      }, icon('haken', { wash: false }), 'Gekocht'),
      h('button', {
        type: 'button', class: 'btn btn--icon btn--ghost meal__remove', 'aria-label': 'Aus dem Plan nehmen', title: 'Aus dem Plan nehmen',
        onclick: () => deleteMeal(meal),
      }, icon('kreuz', { wash: false })),
    ),
  );
}

/** Was es heute gibt: der gewählte Vorschlag, sonst der erste. */
export function todaysMeal(state) {
  const meals = (state.meals || []).filter((m) => m.day === today());
  return meals.find((m) => m.chosen) || meals[0] || null;
}

const mealTitle = (meal) => (meal.recipeId ? recipeById(meal.recipeId)?.title : meal.title) || '…';

// ---------- Auswahl "Was gibt's?" ----------
function pickerDialog(state, ctx) {
  const { day, slot } = ui.picker;
  const close = () => { ui.picker = null; ctx.rerender(); };
  const choose = async (data) => {
    close();
    await addMeal({ day, slot, ...data });
  };
  const q = ui.pickerSearch.trim().toLowerCase();
  const recipes = sortRecipes(state, (state.recipes || []).filter((r) => !q || r.title.toLowerCase().includes(q)), 'pick');
  return modal(`Vorschlag für ${weekdayLong(day)}, ${shortDate(day)}`, close,
    h('input', {
      class: 'input', type: 'search', placeholder: 'Rezept suchen …', 'aria-label': 'Rezept suchen',
      'data-focus-key': 'picker-search', autocomplete: 'off', value: ui.pickerSearch,
      oninput: (e) => { ui.pickerSearch = e.target.value; ctx.rerender(); },
    }),
    recipes.length
      ? h('ul', { class: 'pick-list' }, recipes.slice(0, 30).map((r) => h('li', {},
        h('button', { type: 'button', class: 'pick-list__item', onclick: () => choose({ recipeId: r.id }) },
          h('span', { class: 'pick-list__title' }, r.favorite && icon('herz', { wash: false, className: 'is-fav' }), r.title),
          statusLine(recipeStatus(r, state), true),
        ))))
      : h('p', { class: 'muted' }, state.recipes.length ? 'Kein Rezept gefunden.' : 'Noch keine Rezepte – leg unter „Rezepte“ das erste an.'),
    h('form', {
      class: 'add-form',
      onsubmit: (e) => { e.preventDefault(); const t = ui.pickerText.trim(); if (t) choose({ title: t }); },
    },
      h('input', {
        class: 'input', type: 'text', maxlength: 80, placeholder: 'oder einfach Text, z. B. „Reste“',
        'aria-label': 'Gericht als Text', 'data-focus-key': 'picker-text', autocomplete: 'off', value: ui.pickerText,
        oninput: (e) => { ui.pickerText = e.target.value; },
      }),
      h('button', { type: 'submit', class: 'btn' }, 'Eintragen'),
    ),
  );
}

// =====================================================================
// Rezeptliste (alle / Lieblinge)
// =====================================================================
function listView(state, ctx, tab) {
  let recipes = state.recipes || [];
  if (tab === 'lieblinge') recipes = recipes.filter((r) => r.favorite);
  const allTags = [...new Set(recipes.flatMap((r) => r.tags || []))].sort((a, b) => a.localeCompare(b, 'de'));
  if (ui.tag && !allTags.includes(ui.tag)) ui.tag = null;
  const q = ui.search.trim().toLowerCase();
  const shown = sortRecipes(state, recipes.filter((r) =>
    (!ui.tag || (r.tags || []).includes(ui.tag)) &&
    (!q || r.title.toLowerCase().includes(q) || (r.ingredients || []).some((i) => i.name.toLowerCase().includes(q)))), tab);

  const filters = recipes.length > 0 && h('div', { class: 'recipe-filters' },
    h('input', {
      class: 'input', type: 'search', placeholder: 'Suchen (Name oder Zutat) …', 'aria-label': 'Rezepte suchen',
      'data-focus-key': 'recipe-search', autocomplete: 'off', value: ui.search,
      oninput: (e) => { ui.search = e.target.value; ctx.rerender(); },
    }),
    allTags.length > 0 && h('div', { class: 'pills' },
      allTags.map((t) => h('button', {
        type: 'button', class: ['pill', 'pill--tag', ui.tag === t && 'is-chosen'], 'aria-pressed': String(ui.tag === t),
        'data-focus-key': `tag-${t}`, onclick: () => { ui.tag = ui.tag === t ? null : t; ctx.rerender(); },
      }, `#${t}`))),
  );

  if (!recipes.length) {
    return emptyState({
      symbol: tab === 'lieblinge' ? 'herz' : 'topf',
      title: tab === 'lieblinge' ? 'Noch keine Lieblinge' : 'Noch keine Rezepte',
      text: tab === 'lieblinge' ? 'Tippe bei einem Rezept aufs Herz ♡' : 'Hol eins per Link oder schreib es auf.',
      action: tab !== 'lieblinge' && h('a', { class: 'btn btn--primary', href: '#/kochen/neu' }, iconLabel('plus', 'Neues Rezept')),
    });
  }
  return [filters, shown.length
    ? h('div', { class: 'cards cards--grid' }, shown.map((r) => recipeCard(state, r, tab)))
    : h('p', { class: 'muted on-fridge' }, 'Nichts gefunden.')];
}

/** Sortierung: Lieblinge nach "oft gekocht", sonst: was ihr kochen könnt zuerst. */
function sortRecipes(state, list, mode) {
  const ready = new Map(list.map((r) => [r.id, recipeStatus(r, state)]));
  const missingCount = (r) => ready.get(r.id).missing.length + ready.get(r.id).extra.length;
  return [...list].sort((a, b) => {
    if (mode === 'lieblinge') return b.cookedCount - a.cookedCount || a.title.localeCompare(b.title, 'de');
    if (mode === 'pick' && a.favorite !== b.favorite) return a.favorite ? -1 : 1;
    return missingCount(a) - missingCount(b) || a.title.localeCompare(b.title, 'de');
  });
}

function recipeCard(state, r, tab) {
  const status = recipeStatus(r, state);
  return h('article', { class: 'card card--note recipe-card', 'data-tone': (r.id % 6) + 1 },
    h('div', { class: 'recipe-card__head' },
      h('a', { class: 'recipe-card__title', href: `#/kochen/rezept/${r.id}` }, r.title),
      favButton(r),
    ),
    h('p', { class: 'recipe-meta' },
      r.minutes && h('span', {}, icon('uhr', { wash: false }), formatMinutes(r.minutes)),
      tab === 'lieblinge' && r.cookedCount > 0 && h('span', {}, `${r.cookedCount}× gekocht`),
      (r.tags || []).map((t) => h('span', { class: 'recipe-meta__tag' }, `#${t}`)),
    ),
    statusLine(status),
  );
}

function favButton(r) {
  return h('button', {
    type: 'button', class: ['btn', 'btn--icon', 'btn--ghost', 'fav', r.favorite && 'is-fav'],
    'aria-pressed': String(r.favorite), 'aria-label': r.favorite ? 'Kein Lieblingsgericht mehr' : 'Lieblingsgericht',
    title: 'Lieblingsgericht', 'data-focus-key': `fav-${r.id}`,
    onclick: () => updateRecipe(r, { favorite: !r.favorite }),
  }, icon('herz', { wash: false }));
}

/** "✓ alles da" oder "fehlt: Kokosmilch, Tofu" */
function statusLine(status, short = false) {
  if (status.ready) return h('span', { class: 'status status--ok' }, icon('haken', { wash: false }), 'alles da');
  const names = [...status.missing, ...status.extra].map((r) => r.ing.name);
  const text = short ? `${names.length} ${names.length === 1 ? 'fehlt' : 'fehlen'}`
    : `fehlt: ${names.slice(0, 3).join(', ')}${names.length > 3 ? ` +${names.length - 3}` : ''}`;
  return h('span', { class: 'status status--missing' }, icon('stern', { wash: false }), text);
}

// =====================================================================
// Ein Rezept
// =====================================================================
function backLink(label = 'Rezepte', path = 'rezepte') {
  return h('a', { class: 'back-link', href: `#/kochen/${path}` }, icon('zurueck', { wash: false }), label);
}

function detailView(state, ctx, r) {
  const status = recipeStatus(r, state);
  const toBuy = status.missing.length + status.extra.length;
  const steps = (r.steps || '').split('\n').map((s) => s.trim()).filter(Boolean);
  const creator = personById(r.createdBy);
  return [
    backLink(),
    h('header', { class: 'view-header recipe-head' },
      h('div', {},
        h('h1', { class: 'view-header__title', id: 'title-kochen', tabindex: '-1' }, r.title),
        h('p', { class: 'recipe-meta on-fridge' },
          r.minutes && h('span', {}, icon('uhr', { wash: false }), formatMinutes(r.minutes)),
          r.servings && h('span', {}, `${r.servings} Portionen`),
          r.cookedCount > 0 && h('span', {}, `${r.cookedCount}× gekocht · zuletzt ${formatWhen(r.lastCooked)}`),
          (r.tags || []).map((t) => h('span', { class: 'recipe-meta__tag' }, `#${t}`)),
        ),
      ),
      h('div', { class: 'view-header__actions' },
        favButton(r),
        h('a', { class: 'btn', href: `#/kochen/rezept/${r.id}/bearbeiten` }, iconLabel('stift', 'Bearbeiten')),
      ),
    ),
    h('div', { class: 'cards cards--recipe' },
      // Zutaten
      h('section', { class: 'card card--note', 'data-tone': 3 },
        h('div', { class: 'card__header' },
          h('span', { class: 'card__icon' }, icon('korb')),
          h('h2', { class: 'card__title' }, 'Zutaten'),
          statusLine(status, true),
        ),
        h('ul', { class: 'ing-list' }, status.rows.map((row, i) => ingredientRow(state, row, i))),
        h('div', { class: 'recipe-actions' },
          toBuy > 0
            ? h('button', { type: 'button', class: 'btn btn--primary', 'data-focus-key': 'shop', onclick: () => shopFor(r, state) },
              iconLabel('korb', `Fehlendes einkaufen (${toBuy})`))
            : h('p', { class: 'hand recipe-ready' }, 'Alles da – los geht’s ♡'),
          h('button', { type: 'button', class: 'btn', 'data-focus-key': 'cooked', onclick: () => openCook(state, ctx, r, null) },
            iconLabel('haken', 'Gekocht')),
        ),
        planPills(state, r),
      ),
      // Zubereitung
      h('section', { class: 'card card--note', 'data-tone': 1 },
        h('div', { class: 'card__header' },
          h('span', { class: 'card__icon' }, icon('topf')),
          h('h2', { class: 'card__title' }, 'Zubereitung'),
        ),
        steps.length
          ? h('ol', { class: 'steps' }, steps.map((s) => h('li', {}, s)))
          : h('p', { class: 'muted' }, 'Keine Schritte notiert.'),
        r.sourceUrl && h('p', { class: 'recipe-source' },
          h('a', { href: r.sourceUrl, target: '_blank', rel: 'noopener noreferrer' }, icon('link', { wash: false }), 'Original-Rezept')),
      ),
      // Notizen
      h('section', { class: 'card card--note', 'data-tone': 5 },
        h('div', { class: 'card__header' },
          h('span', { class: 'card__icon' }, icon('notiz')),
          h('h2', { class: 'card__title' }, 'Unsere Notizen'),
        ),
        h('textarea', {
          class: 'input input--area', rows: 3, maxlength: 2000, 'aria-label': 'Notizen zum Rezept',
          placeholder: 'z. B. „weniger Chili!“ oder „doppelte Menge Soße“', 'data-focus-key': `notes-${r.id}`,
          value: ui.notes[r.id] ?? r.notes ?? '',
          oninput: (e) => { ui.notes[r.id] = e.target.value; },
          onblur: () => {
            const v = (ui.notes[r.id] ?? r.notes ?? '').trim();
            delete ui.notes[r.id];
            if (v !== (r.notes || '')) updateRecipe(r, { notes: v || null });
          },
        }),
        h('p', { class: 'recipe-by' },
          creator && h('span', { class: 'byline' }, avatar(creator, { size: 'xs' }), `eingetragen von ${creator.name}`),
          h('button', {
            type: 'button', class: 'btn btn--small btn--danger',
            onclick: async () => {
              if (!confirm(`Rezept „${r.title}“ löschen? Es verschwindet auch aus dem Wochenplan.`)) return;
              if (await deleteRecipe(r) !== null) { showToast(`„${r.title}“ gelöscht`); go('rezepte'); }
            },
          }, iconLabel('muell', 'Rezept löschen')),
        ),
      ),
    ),
  ];
}

const STATUS_LABEL = { da: 'da', knapp: 'zu wenig', fehlt: 'fehlt', extra: 'Wunschzettel' };

function ingredientRow(state, row, i) {
  const { ing, item, linked, key, status } = row;
  const wished = status === 'extra' && onWishlist(ing, state);
  const value = linked ? (item ? String(item.id) : 'none') : 'auto';
  // Zuordnung ändern: automatisch / nicht im Vorrat / bestimmter Vorratsartikel
  const select = h('select', {
    class: 'ing-map', 'aria-label': `${ing.name}: Vorratsartikel`, 'data-focus-key': `map-${i}`,
    onchange: (e) => {
      const v = e.target.value;
      linkIngredient(key, v === 'auto' ? undefined : v === 'none' ? null : Number(v));
    },
  },
    h('option', { value: 'auto' }, linked ? 'automatisch' : `↳ ${item ? item.name : 'nicht im Vorrat'}`),
    h('option', { value: 'none' }, 'nicht im Vorrat (Wunschzettel)'),
    state.categories.map((cat) => h('optgroup', { label: cat.name },
      state.items.filter((it) => it.categoryId === cat.id).map((it) => h('option', { value: String(it.id) }, it.name)))),
  );
  select.value = value;
  if (linked && item) select.options[0].textContent = 'automatisch'; // gewählter Artikel steht in der Liste
  return h('li', { class: ['ing', `ing--${status}`] },
    h('span', { class: 'ing__dot', title: STATUS_LABEL[status] }, icon(status === 'da' ? 'haken' : status === 'extra' ? 'herz' : 'stern', { wash: false })),
    h('span', { class: 'ing__text' },
      h('span', { class: 'ing__name' }, ingredientText(ing)),
      h('span', { class: 'ing__status' },
        wished ? 'steht auf dem Wunschzettel' : STATUS_LABEL[status],
        item?.quantity != null && ` · ${formatQty(item.quantity)}${item.unit ? ` ${item.unit}` : ''} im Vorrat`),
    ),
    select,
  );
}

/** Fehlendes: Vorratsartikel auf die Einkaufsliste, alles andere auf den Wunschzettel. */
async function shopFor(r, state) {
  const { missing, extra } = recipeStatus(r, state);
  let list = 0, wish = 0;
  for (const row of missing) {
    if (!row.item.missing) { await setMissing(row.item, true); list++; }
  }
  for (const row of extra) {
    const amount = [formatQty(row.ing.qty), row.ing.unit].filter(Boolean).join(' ') || null;
    if (await addWish(row.ing.name, amount, r.id)) wish++;
  }
  const parts = [list && `${list} auf die Einkaufsliste`, wish && `${wish} auf den Wunschzettel`].filter(Boolean);
  showToast(parts.length ? `${parts.join(', ')} ♡` : 'Steht schon alles auf den Listen');
}

/** Schnell in den Wochenplan: die nächsten 7 Tage. */
function planPills(state, r) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(today(), i));
  return h('div', { class: 'choice' },
    h('p', { class: 'choice__legend' }, 'In den Wochenplan:'),
    h('div', { class: 'pills' }, days.map((day, i) => {
      const meals = (state.meals || []).filter((m) => m.day === day);
      const planned = meals.some((m) => m.recipeId === r.id);
      const full = meals.length >= 2;
      return h('button', {
        type: 'button', class: ['pill', planned && 'is-chosen'], disabled: (full && !planned) || null,
        'aria-pressed': String(planned), 'data-focus-key': `plan-${day}`,
        title: full && !planned ? 'Schon 2 Vorschläge' : null,
        onclick: async () => {
          if (planned) return deleteMeal(meals.find((m) => m.recipeId === r.id));
          const slot = meals.some((m) => m.slot === 1) ? 2 : 1;
          if (await addMeal({ day, slot, recipeId: r.id })) showToast(`Steht am ${weekdayLong(day)} im Plan`);
        },
      }, i === 0 ? 'heute' : weekday(day));
    })),
  );
}

// =====================================================================
// Gekocht: Vorrat anpassen
// =====================================================================
function openCook(state, ctx, recipe, meal) {
  const entries = recipe ? deductionPlan(recipe, state) : [];
  ui.cook = { recipe, meal, entries };
  ctx.rerender();
  focusLater('[data-focus-key="cook-ok"]');
}

function cookDialog(ctx) {
  const { recipe, meal, entries } = ui.cook;
  const close = () => { ui.cook = null; ctx.rerender(); };
  const counted = entries.filter((e) => e.from != null);
  const others = entries.filter((e) => e.from == null);
  const step = (e) => (e.item.unit && !/^(stück|dose|glas|packung|flasche|becher|bund)/i.test(e.item.unit) && e.from >= 50 ? 50 : 1);
  return modal(`Gekocht: ${recipe?.title || meal?.title || ''} ♡`, close,
    counted.length > 0 && [
      h('p', { class: 'muted' }, 'Das ziehe ich vom Vorrat ab – passt’s?'),
      h('ul', { class: 'cook-list' }, counted.map((e) => h('li', { class: 'cook-row' },
        h('span', { class: 'cook-row__name' }, e.item.name),
        h('span', { class: 'cook-row__from' }, `${formatQty(e.from)} →`),
        stepper(e.to, e.item.unit, (v) => { e.to = v; ctx.rerender(); }, `cook-${e.item.id}`, step(e)),
      ))),
    ],
    others.length > 0 && [
      h('p', { class: 'muted' }, 'Ist etwas davon jetzt alle? (kommt dann auf die Einkaufsliste)'),
      h('div', { class: 'pills' }, others.map((e) => h('button', {
        type: 'button', class: ['pill', e.empty && 'is-chosen'], 'aria-pressed': String(Boolean(e.empty)),
        'data-focus-key': `empty-${e.item.id}`, onclick: () => { e.empty = !e.empty; ctx.rerender(); },
      }, e.item.name))),
    ],
    !entries.length && h('p', { class: 'muted' }, 'Guten Appetit! Soll ich es als gekocht eintragen?'),
    h('div', { class: 'add-form' },
      h('button', {
        type: 'button', class: 'btn btn--primary', 'data-focus-key': 'cook-ok',
        onclick: async () => {
          const changes = [
            ...counted.filter((e) => e.to !== e.from).map((e) => ({ item: e.item, quantity: e.to })),
            ...others.filter((e) => e.empty).map((e) => ({ item: e.item, empty: true })),
          ];
          close();
          await cookRecipe(recipe, changes, meal);
          showToast('Guten Appetit ♡');
        },
      }, 'Passt so'),
      h('button', { type: 'button', class: 'btn btn--ghost', onclick: close }, 'Abbrechen'),
    ),
  );
}

/** [–] 2 Dosen [+] */
export function stepper(value, unit, onChange, key, step = 1) {
  return h('span', { class: 'stepper' },
    h('button', {
      type: 'button', class: 'stepper__btn', 'aria-label': 'weniger', 'data-focus-key': `${key}-minus`,
      disabled: value <= 0 || null, onclick: () => onChange(Math.max(0, Math.round((value - step) * 100) / 100)),
    }, icon('minus', { wash: false })),
    h('span', { class: 'stepper__value', 'aria-live': 'polite' }, formatQty(value), unit && h('small', {}, ` ${unit}`)),
    h('button', {
      type: 'button', class: 'stepper__btn', 'aria-label': 'mehr', 'data-focus-key': `${key}-plus`,
      onclick: () => onChange(Math.round((value + step) * 100) / 100),
    }, icon('plus', { wash: false })),
  );
}

// =====================================================================
// Rezept anlegen / bearbeiten
// =====================================================================
function draftFrom(r) {
  return {
    id: r?.id ?? null,
    url: '',
    title: r?.title || '',
    minutes: r?.minutes ?? '',
    servings: r?.servings ?? '',
    tags: (r?.tags || []).join(', '),
    ingredients: (r?.ingredients || []).map((i) => ingredientText(i)).join('\n'),
    steps: r?.steps || '',
    notes: r?.notes || '',
    favorite: r?.favorite || false,
    sourceUrl: r?.sourceUrl || null,
    busy: false,
  };
}

function formView(state, ctx, recipe) {
  if (!ui.form || ui.form.id !== (recipe?.id ?? null)) ui.form = draftFrom(recipe);
  const f = ui.form;
  const field = (label, input, hint) => h('label', { class: 'field' },
    h('span', { class: 'field__label' }, label), input, hint && h('span', { class: 'field__hint' }, hint));
  const bind = (key, props = {}) => ({
    class: 'input', value: f[key], 'data-focus-key': `form-${key}`, autocomplete: 'off',
    oninput: (e) => { f[key] = e.target.value; }, ...props,
  });
  const cancel = () => { ui.form = null; go(recipe ? `rezept/${recipe.id}` : 'rezepte'); };
  const existingTags = [...new Set((state.recipes || []).flatMap((r) => r.tags || []))];
  const currentTags = f.tags.split(',').map((t) => t.trim()).filter(Boolean);

  return [
    backLink(recipe ? recipe.title : 'Rezepte', recipe ? `rezept/${recipe.id}` : 'rezepte'),
    viewHeader({ id: 'title-kochen', title: recipe ? 'Rezept bearbeiten' : 'Neues Rezept' }),
    h('form', {
      class: 'cards cards--recipe recipe-form',
      onsubmit: async (e) => {
        e.preventDefault();
        await save(ctx, recipe);
      },
    },
      !recipe && h('section', { class: 'card card--note', 'data-tone': 4 },
        h('div', { class: 'card__header' },
          h('span', { class: 'card__icon' }, icon('link')),
          h('h2', { class: 'card__title' }, 'Per Link holen'),
        ),
        h('p', { class: 'muted' }, 'Link von einer Rezeptseite einfügen – Zutaten und Schritte werden übernommen.'),
        h('div', { class: 'add-form' },
          h('input', bind('url', { type: 'url', placeholder: 'https://…', 'aria-label': 'Link zum Rezept', inputmode: 'url', enterkeyhint: 'go',
            onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); fetchDraft(ctx); } } })),
          h('button', { type: 'button', class: 'btn btn--primary', disabled: f.busy || null, 'data-focus-key': 'form-fetch', onclick: () => fetchDraft(ctx) },
            f.busy ? 'Hole …' : 'Holen'),
        ),
      ),
      h('section', { class: 'card card--note', 'data-tone': 3 },
        h('div', { class: 'card__header' },
          h('span', { class: 'card__icon' }, icon('stift')),
          h('h2', { class: 'card__title' }, recipe ? 'Rezept' : 'Oder selbst schreiben'),
        ),
        field('Name', h('input', bind('title', { type: 'text', maxlength: 120, required: true, placeholder: 'z. B. Linsen-Curry' }))),
        h('div', { class: 'field-row' },
          field('Zeit (Minuten)', h('input', bind('minutes', { type: 'number', min: 0, max: 2000, inputmode: 'numeric', placeholder: '30' }))),
          field('Portionen', h('input', bind('servings', { type: 'number', min: 1, max: 99, inputmode: 'numeric', placeholder: '2' }))),
        ),
        field('Schlagwörter', h('input', bind('tags', { type: 'text', placeholder: 'z. B. schnell, Meal-Prep' })),
          existingTags.length ? null : 'mit Komma trennen'),
        existingTags.length > 0 && h('div', { class: 'pills pills--small' }, existingTags.map((t) => h('button', {
          type: 'button', class: ['pill', 'pill--tag', currentTags.includes(t) && 'is-chosen'], 'data-focus-key': `ftag-${t}`,
          onclick: () => {
            const next = currentTags.includes(t) ? currentTags.filter((x) => x !== t) : [...currentTags, t];
            f.tags = next.join(', ');
            ctx.rerender();
          },
        }, `#${t}`))),
        h('button', {
          type: 'button', class: ['pill', 'pill--fav', f.favorite && 'is-chosen'], 'aria-pressed': String(f.favorite),
          'data-focus-key': 'form-fav', onclick: () => { f.favorite = !f.favorite; ctx.rerender(); },
        }, icon('herz', { wash: false }), 'Lieblingsgericht'),
      ),
      h('section', { class: 'card card--note', 'data-tone': 2 },
        field('Zutaten', h('textarea', bind('ingredients', {
          rows: 8, placeholder: '400 g Kichererbsen\n1 Dose Kokosmilch\n2 Knoblauchzehen\nSalz', class: 'input input--area',
        })), 'eine Zutat pro Zeile – Menge und Einheit vorne'),
        field('Zubereitung', h('textarea', bind('steps', {
          rows: 8, maxlength: 8000, placeholder: 'Zwiebeln anbraten …\nKokosmilch dazu …', class: 'input input--area',
        })), 'ein Schritt pro Zeile'),
        field('Notizen', h('textarea', bind('notes', { rows: 2, maxlength: 2000, class: 'input input--area' }))),
        h('div', { class: 'add-form' },
          h('button', { type: 'submit', class: 'btn btn--primary', 'data-focus-key': 'form-save' }, 'Speichern'),
          h('button', { type: 'button', class: 'btn btn--ghost', onclick: cancel }, 'Abbrechen'),
        ),
      ),
    ),
  ];
}

async function fetchDraft(ctx) {
  const f = ui.form;
  if (!f.url.trim() || f.busy) return;
  f.busy = true;
  ctx.rerender();
  try {
    const d = await importRecipe(f.url.trim());
    Object.assign(f, {
      title: d.title || f.title,
      minutes: d.minutes ?? '',
      servings: d.servings ?? '',
      tags: (d.tags || []).join(', '),
      ingredients: (d.ingredients || []).join('\n'),
      steps: (d.steps || []).join('\n'),
      sourceUrl: d.sourceUrl || f.url.trim(),
    });
    showToast('Rezept geholt – kurz prüfen und speichern ♡');
  } catch (err) {
    showToast(err.status ? err.message : 'Server nicht erreichbar', { variant: 'error' });
  } finally {
    f.busy = false;
    ctx.rerender();
  }
}

async function save(ctx, recipe) {
  const f = ui.form;
  const title = f.title.trim();
  if (!title) return;
  const num = (v) => (String(v).trim() === '' ? null : Math.round(Number(v)));
  const data = {
    title,
    minutes: num(f.minutes),
    servings: num(f.servings),
    tags: [...new Set(f.tags.split(',').map((t) => t.trim()).filter(Boolean))].slice(0, 10).map((t) => t.slice(0, 24)),
    ingredients: f.ingredients.split('\n').map(parseIngredient).filter(Boolean).slice(0, 80),
    steps: f.steps.trim() || null,
    notes: f.notes.trim() || null,
    favorite: f.favorite,
    sourceUrl: f.sourceUrl || null,
  };
  const saved = recipe ? await updateRecipe(recipe, data) : await addRecipe(data);
  if (!saved) return;
  ui.form = null;
  showToast(recipe ? 'Gespeichert ♡' : `„${title}“ ist jetzt im Rezeptbuch ♡`);
  go(`rezept/${saved.id}`);
}

// =====================================================================
// Bausteine
// =====================================================================
function modal(title, onClose, ...content) {
  return h('div', {
    class: 'sheet-screen',
    onclick: (e) => { if (e.target === e.currentTarget) onClose(); },
    onkeydown: (e) => { if (e.key === 'Escape') onClose(); },
  },
    h('div', { class: 'card card--note sheet', 'data-tone': 3, role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('div', { class: 'sheet__head' },
        h('h2', { class: 'card__title' }, title),
        h('button', { type: 'button', class: 'btn btn--icon btn--ghost', 'aria-label': 'Schließen', onclick: onClose }, icon('kreuz', { wash: false })),
      ),
      ...content,
    ),
  );
}

function focusLater(selector) {
  requestAnimationFrame(() => document.querySelector(selector)?.focus({ preventScroll: true }));
}

// ---------- Zettel "Heute gibt's" für die Kühlschranktür (Vorrat) ----------
export function todayMealCard(state) {
  const meals = (state.meals || []).filter((m) => m.day === today()).sort((a, b) => a.slot - b.slot);
  if (!meals.length) return null;
  const chosen = meals.find((m) => m.chosen);
  const shown = chosen ? [chosen] : meals;
  return h('section', { class: 'card card--note card--due', 'data-tone': 4 },
    h('div', { class: 'card__header' },
      h('span', { class: 'card__icon' }, icon('topf')),
      h('h2', { class: 'card__title' }, 'Heute gibt’s'),
      h('a', { class: 'card__link', href: '#/kochen' }, 'Wochenplan'),
    ),
    h('ul', { class: 'today-meals' }, shown.map((m, i) => {
      const recipe = m.recipeId ? recipeById(m.recipeId) : null;
      return h('li', {},
        i > 0 && h('span', { class: 'today-meals__or' }, 'oder'),
        recipe ? h('a', { class: 'meal__title', href: `#/kochen/rezept/${recipe.id}` }, recipe.title) : h('span', { class: 'meal__title' }, m.title),
        recipe && statusLine(recipeStatus(recipe, state), true),
      );
    })),
  );
}
