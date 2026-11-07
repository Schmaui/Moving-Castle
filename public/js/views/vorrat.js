// Ansichten "Vorrat" (/#/vorrat, Essen) und "Haushalt" (/#/haushalt, Bad, Putzen …):
// alle Artikel als Chips pro Kategorie. Beide liegen in der Leiste unter "Küche"
// (Reiter oben: Vorrat · Haushalt · Kochen, siehe kitchenTabs in ui/components.js).
// Antippen = fehlt (rot, landet auf der Einkaufsliste). Nochmal = doch da.
// "Bearbeiten" schaltet den Bearbeiten-Modus ein.
// Zettel sind zugeklappt (zeigen nur, was fehlt) – Überschrift antippen klappt auf.
// Welche Zettel offen sind, merkt sich jedes Gerät selbst (localStorage).
import { h, sameName } from '../util.js';
import { viewHeader, categoryHeader, loading, toneOf, iconLabel, kitchenTabs } from '../ui/components.js';
import { icon, PICKABLE } from '../ui/art.js';
import { photoLayer, photoHint, doorPhotos } from '../ui/photos.js';
import { dueNoteCard } from './aufgaben.js';
import { todayMealCard } from './kochen.js';
import { formatQty } from '../recipes.js';
import { setMissing, addItem, deleteItem, restoreItem, addCategory, deleteCategory, updateItem, updateCategory, areaOf, sortedPhotos, myPrefs, updateMyPrefs } from '../store.js';
import { showToast } from '../ui/toast.js';
import { CONFIG } from '../config.js';

const OPEN_KEY = 'haushalt_offene_zettel'; // früher pro Gerät – wird einmal zur Person übernommen

// Zustand nur dieser Ansicht (bleibt beim Neuzeichnen erhalten)
const ui = {
  editMode: false,
  addOpen: new Set(),   // Kategorien mit offenem Eingabefeld
  drafts: {},           // angefangene Eingaben
  newCategoryOpen: false,
  justToggled: null,    // Artikel, der gerade angetippt wurde (kurzes Wippen)
  editing: null,        // Artikel, der gerade bearbeitet wird: { id, name, quantity, minQty, unit }
};

// ---------- Auf-/Zuklappen (pro Person gespeichert, store.js myPrefs) ----------
function localOpen() {
  try { return JSON.parse(localStorage.getItem(OPEN_KEY) || '[]').filter(Number.isSafeInteger); } catch { return []; }
}
/** Aufgeklappte Zettel. Noch nie pro Person gespeichert? Dann das, was dieses Gerät bisher wusste. */
function openSet() {
  const saved = myPrefs().openNotes;
  return new Set(saved ?? localOpen());
}
function saveOpen(set) {
  updateMyPrefs({ openNotes: [...set] });
}
const isOpen = (cat, open) => ui.editMode || open.has(cat.id) || ui.addOpen.has(cat.id);
function toggleOpen(cat, ctx) {
  const open = openSet();
  if (open.has(cat.id)) { open.delete(cat.id); ui.addOpen.delete(cat.id); } else open.add(cat.id);
  saveOpen(open);
  ctx.rerender();
}

// Vorschläge für Einheiten (man kann auch etwas anderes eintippen)
const UNIT_SUGGESTIONS = ['Stück', 'Dose', 'Packung', 'Glas', 'Flasche', 'Becher', 'g', 'kg', 'ml', 'l'];

/** Erzeugt die Ansicht für einen Bereich ('kueche' = Vorrat, 'haushalt'). */
function stockView({ id, area, title, icon: iconName, intro, navLabel, navAlso, inNav = true, decorate = false }) {
  return {
    id,
    label: title,
    navLabel,
    navAlso,
    inNav,
    icon: iconName,   // Symbolname aus js/ui/art.js

    render(state, ctx) {
      if (!state.loaded) return loading();
      const categories = state.categories.filter((c) => areaOf(c) === area);
      const catIds = new Set(categories.map((c) => c.id));
      const items = state.items.filter((i) => catIds.has(i.categoryId));
      const missingCount = items.filter((i) => i.missing).length;

      const header = viewHeader({
        id: `title-${id}`,
        title,
        subtitle: ui.editMode
          ? 'Tippe an, was du ändern oder löschen willst …'
          : `${intro} ~ ${missingCount} von ${items.length} fehlen`,
        actions: [
          !ui.editMode && categories.length > 0 && (() => {
            const open = openSet();
            const allOpen = categories.every((c) => open.has(c.id));
            return h('button', {
              type: 'button', class: 'btn btn--ghost', 'data-focus-key': `open-all-${id}`,
              'aria-label': allOpen ? 'Alle Zettel zuklappen' : 'Alle Zettel aufklappen',
              onclick: () => {
                for (const c of categories) { if (allOpen) open.delete(c.id); else open.add(c.id); }
                if (allOpen) ui.addOpen.clear();
                saveOpen(open);
                ctx.rerender();
              },
            }, allOpen ? iconLabel('hoch', 'Alle zu') : iconLabel('runter', 'Alle auf'));
          })(),
          h('button', {
            type: 'button',
            class: ['btn', ui.editMode && 'btn--active'],
            'aria-pressed': String(ui.editMode),
            'data-focus-key': `edit-toggle-${id}`,
            onclick: () => { ui.editMode = !ui.editMode; ui.editing = null; ctx.rerender(); },
          }, ui.editMode ? iconLabel('haken', 'Fertig') : iconLabel('stift', 'Bearbeiten')),
        ],
      });

      const cards = categories.map((cat) =>
        categoryCard(cat, items.filter((i) => i.categoryId === cat.id), ctx));

      if (!decorate) return [kitchenTabs(id), header, h('div', { class: 'cards' }, cards, newCategoryCard(ctx, area))];

      // Fotos hängen wie Magnete verstreut über der Tür (Position: scatterPhotos in ui/photos.js).
      // Einstellung "Fotos an der Tür": 0 = aus.
      const showPhotos = (myPrefs().photoEvery ?? 2) > 0;
      const photos = showPhotos ? doorPhotos(sortedPhotos()) : [];
      // Fällige Aufgaben und das heutige Essen hängen als erste Zettel an der Tür
      const board = [dueNoteCard(state, ctx), todayMealCard(state)].filter(Boolean);
      cards.forEach((card, i) => {
        board.push(card);
        if (showPhotos && i === 0 && !photos.length) board.push(photoHint());
      });

      return [kitchenTabs(id), header, h('div', { class: 'fridge-board' },
        h('div', { class: 'cards' }, board, newCategoryCard(ctx, area)),
        photos.length > 0 && photoLayer(photos),
      )];
    },
  };
}

export default stockView({
  id: 'vorrat', area: 'kueche', title: 'Vorrat', icon: 'topf', intro: 'Tippe an, was fehlt',
  navLabel: 'Küche', navAlso: ['haushalt', 'kochen'], decorate: true,
});

export const haushalt = stockView({
  id: 'haushalt', area: 'haushalt', title: 'Haushalt', icon: 'putzmittel', intro: 'Bad, Putzen & Co.', inNav: false,
});

function categoryCard(cat, items, ctx) {
  const missing = items.filter((i) => i.missing).length;
  const canDeleteCategory = ui.editMode && items.length === 0;
  const open = isOpen(cat, openSet());
  const shown = open ? items : items.filter((i) => i.missing);

  const header = categoryHeader(cat,
      missing > 0 && h('span', { class: 'badge badge--soft' }, `${missing} ${missing === 1 ? 'fehlt' : 'fehlen'}`),
      ui.editMode && h('button', {
        type: 'button',
        class: 'btn btn--small btn--ghost card__move',
        title: areaOf(cat) === 'haushalt' ? 'In den Vorrat (Essen) verschieben' : 'In den Haushalt verschieben',
        'data-focus-key': `move-${cat.id}`,
        onclick: () => {
          const to = areaOf(cat) === 'haushalt' ? 'kueche' : 'haushalt';
          updateCategory(cat, { area: to });
          showToast(`„${cat.name}“ liegt jetzt unter ${to === 'haushalt' ? 'Haushalt' : 'Vorrat'}`);
        },
      }, areaOf(cat) === 'haushalt' ? '→ Vorrat' : '→ Haushalt'),
      canDeleteCategory && h('button', {
        type: 'button',
        class: 'btn btn--icon btn--danger',
        title: 'Leere Kategorie löschen',
        'aria-label': `Kategorie ${cat.name} löschen`,
        onclick: () => deleteCategory(cat),
      }, icon('muell', { wash: false })),
      h('button', {
        type: 'button',
        class: 'btn btn--icon btn--ghost',
        title: 'Artikel hinzufügen',
        'aria-label': `Artikel zu ${cat.name} hinzufügen`,
        'aria-expanded': String(ui.addOpen.has(cat.id)),
        'data-focus-key': `plus-${cat.id}`,
        onclick: () => toggleAdd(cat.id, ctx),
      }, icon(ui.addOpen.has(cat.id) ? 'minus' : 'plus', { wash: false })),
  );
  // Überschrift antippen = auf-/zuklappen (Knöpfe darin behalten ihre eigene Aufgabe)
  if (!ui.editMode) {
    header.classList.add('card__header--toggle');
    header.addEventListener('click', (e) => { if (!e.target.closest('button, a, input')) toggleOpen(cat, ctx); });
    header.querySelector('.card__title')?.replaceChildren(h('button', {
      type: 'button', class: 'card__toggle', 'aria-expanded': String(open), 'data-focus-key': `toggle-${cat.id}`,
      onclick: () => toggleOpen(cat, ctx),
    }, cat.name, icon('runter', { wash: false, className: ['card__chevron', open && 'is-open'].filter(Boolean).join(' ') })));
  }

  return h('section', { class: ['card', !open && 'card--closed'], 'data-tone': toneOf(cat) },
    header,
    items.length === 0
      ? h('p', { class: 'muted' }, 'Noch keine Artikel.')
      : shown.length > 0
        ? h('div', { class: 'chips' }, shown.map((item) => chip(item, ctx)))
        : h('button', {
          type: 'button', class: 'card__all-there', 'data-focus-key': `all-there-${cat.id}`,
          onclick: () => toggleOpen(cat, ctx),
        }, icon('haken', { wash: false }), `alles da · ${items.length} Artikel`),
    ui.editMode && ui.editing && items.some((i) => i.id === ui.editing.id) && itemEditor(items.find((i) => i.id === ui.editing.id), ctx),
    ui.addOpen.has(cat.id) && addForm(cat, items, ctx),
  );
}

/** Kleine Zahl im Chip, wenn der Artikel Mengen hat. */
const qtyBadge = (item) => item.quantity != null &&
  h('span', { class: 'chip__qty', title: item.minQty != null ? `mindestens ${formatQty(item.minQty)}` : null },
    `${formatQty(item.quantity)}${item.unit ? ` ${item.unit}` : ''}`);

function chip(item, ctx) {
  if (ui.editMode) {
    const open = ui.editing?.id === item.id;
    return h('button', {
      type: 'button',
      class: ['chip', 'chip--delete', item.missing && 'is-missing', open && 'is-editing'],
      'data-focus-key': `chip-${item.id}`,
      'aria-label': `${item.name} bearbeiten`,
      'aria-expanded': String(open),
      onclick: () => {
        ui.editing = open ? null : {
          id: item.id, name: item.name, quantity: item.quantity ?? '', minQty: item.minQty ?? '', unit: item.unit ?? '',
        };
        ctx.rerender();
        if (!open) document.querySelector('[data-focus-key="edit-qty"]')?.focus();
      },
    }, item.name, qtyBadge(item), h('span', { class: 'chip__x' }, icon('stift', { wash: false })));
  }
  return h('button', {
    type: 'button',
    class: ['chip', item.missing && 'is-missing', ui.justToggled === item.id && 'is-wiggling'],
    'aria-pressed': String(item.missing),
    'data-focus-key': `chip-${item.id}`,
    title: item.note || (item.missing ? 'Fehlt – antippen, wenn wieder da' : 'Antippen, wenn es fehlt'),
    onclick: () => {
      ui.justToggled = item.id;
      clearTimeout(ui.wiggleTimer);
      ui.wiggleTimer = setTimeout(() => { ui.justToggled = null; }, 600);
      setMissing(item, !item.missing);
    },
  }, item.missing && icon('stern', { wash: false, className: 'chip__star' }), item.name, qtyBadge(item));
}

/** Artikel bearbeiten: Name, Mengen (optional), Löschen. */
function itemEditor(item, ctx) {
  const d = ui.editing;
  const close = () => { ui.editing = null; ctx.rerender(); };
  const num = (v) => (String(v).trim() === '' ? null : Math.max(0, Number(String(v).replace(',', '.'))));
  const field = (label, key, props) => h('label', { class: 'field' },
    h('span', { class: 'field__label' }, label),
    h('input', {
      class: 'input', value: d[key], 'data-focus-key': `edit-${key}`, autocomplete: 'off',
      oninput: (e) => { d[key] = e.target.value; }, ...props,
    }));
  return h('form', {
    class: 'item-editor',
    onsubmit: async (e) => {
      e.preventDefault();
      const name = d.name.trim();
      if (!name) return;
      const patch = { name, quantity: num(d.quantity), minQty: num(d.minQty), unit: d.unit.trim() || null };
      if ([patch.quantity, patch.minQty].some((v) => Number.isNaN(v))) {
        showToast('Bitte bei Mengen nur Zahlen eintragen', { variant: 'error' });
        return;
      }
      for (const k of Object.keys(patch)) if (patch[k] === (item[k] ?? null)) delete patch[k];
      ui.editing = null;
      if (Object.keys(patch).length) await updateItem(item, patch);
      ctx.rerender();
    },
    onkeydown: (e) => { if (e.key === 'Escape') close(); },
  },
    field('Name', 'name', { type: 'text', maxlength: 80 }),
    h('div', { class: 'field-row' },
      field('Menge da', 'quantity', { type: 'text', inputmode: 'decimal', placeholder: 'z. B. 3' }),
      field('mindestens', 'minQty', { type: 'text', inputmode: 'decimal', placeholder: 'z. B. 2' }),
      field('Einheit', 'unit', { type: 'text', maxlength: 20, placeholder: 'Dose', list: 'unit-suggestions' }),
    ),
    h('datalist', { id: 'unit-suggestions' }, UNIT_SUGGESTIONS.map((u) => h('option', { value: u }))),
    h('p', { class: 'field__hint' }, 'Mengen sind freiwillig. Mit „mindestens“ kommt der Artikel von selbst auf die Liste, wenn weniger da ist.'),
    h('div', { class: 'add-form' },
      h('button', { type: 'submit', class: 'btn btn--primary' }, 'Speichern'),
      h('button', { type: 'button', class: 'btn btn--ghost', onclick: close }, 'Abbrechen'),
      h('button', {
        type: 'button', class: 'btn btn--danger item-editor__delete', 'data-focus-key': 'edit-delete',
        onclick: () => {
          ui.editing = null;
          deleteItem(item);
          showToast(`„${item.name}“ gelöscht`, { actionLabel: 'Rückgängig', onAction: () => restoreItem(item) });
        },
      }, iconLabel('muell', 'Löschen')),
    ),
  );
}

function toggleAdd(catId, ctx) {
  if (ui.addOpen.has(catId)) ui.addOpen.delete(catId);
  else ui.addOpen.add(catId);
  ctx.rerender();
  document.querySelector(`[data-focus-key="add-${catId}"]`)?.focus();
}

function addForm(cat, items, ctx) {
  const key = `add-${cat.id}`;
  return h('form', {
    class: 'add-form',
    onsubmit: async (e) => {
      e.preventDefault();
      const name = (ui.drafts[key] || '').trim();
      if (!name) return;
      if (items.some((i) => sameName(i.name, name))) {
        showToast(`„${name}“ gibt es in ${cat.name} schon`);
        return;
      }
      ui.drafts[key] = '';
      const created = await addItem(cat.id, name);
      if (!created) ui.drafts[key] = name; // Fehler: Eingabe behalten
      ctx.rerender();
    },
  },
    h('input', {
      class: 'input',
      type: 'text',
      name: 'name',
      placeholder: 'Neuer Artikel …',
      maxlength: 80,
      autocomplete: 'off',
      enterkeyhint: 'done',
      'aria-label': `Neuer Artikel in ${cat.name}`,
      'data-focus-key': key,
      value: ui.drafts[key] || '',
      oninput: (e) => { ui.drafts[key] = e.target.value; },
      onkeydown: (e) => {
        if (e.key === 'Escape') { ui.addOpen.delete(cat.id); ctx.rerender(); }
      },
    }),
    h('button', { class: 'btn btn--primary', type: 'submit' }, 'Hinzufügen'),
  );
}

function newCategoryCard(ctx, area) {
  if (!ui.newCategoryOpen) {
    return h('div', { class: 'card card--new' },
      h('button', {
        type: 'button',
        class: 'btn btn--ghost',
        'data-focus-key': `new-cat-open-${area}`,
        onclick: () => {
          ui.newCategoryOpen = true;
          ctx.rerender();
          document.querySelector(`[data-focus-key="new-cat-name-${area}"]`)?.focus();
        },
      }, iconLabel('plus', 'Neue Kategorie')),
    );
  }

  const close = () => { ui.newCategoryOpen = false; ui.drafts.catName = ''; ui.drafts.catIcon = ''; ctx.rerender(); };
  const chosen = ui.drafts.catIcon || CONFIG.defaultIcon;
  return h('form', {
    class: 'card card--new',
    onsubmit: async (e) => {
      e.preventDefault();
      const name = (ui.drafts.catName || '').trim();
      if (!name) return;
      const created = await addCategory(name, chosen, area);
      if (created) close();
    },
    onkeydown: (e) => { if (e.key === 'Escape') close(); },
  },
    h('h2', { class: 'card__title' }, 'Neue Kategorie'),
    h('div', { class: 'add-form' },
      h('input', {
        class: 'input', type: 'text', maxlength: 40, placeholder: area === 'haushalt' ? 'Name, z. B. Pflanzen' : 'Name, z. B. Getränke',
        'aria-label': 'Name der Kategorie', 'data-focus-key': `new-cat-name-${area}`, autocomplete: 'off',
        enterkeyhint: 'done', value: ui.drafts.catName || '',
        oninput: (e) => { ui.drafts.catName = e.target.value; },
      }),
    ),
    // Bild auswählen (Symbole aus js/ui/art.js mit pick: true)
    h('fieldset', { class: 'icon-picker' },
      h('legend', { class: 'icon-picker__legend' }, 'Bild aussuchen'),
      PICKABLE.map(({ name, label }, i) => h('button', {
        type: 'button',
        class: ['icon-picker__item', name === chosen && 'is-chosen'],
        'data-tone': (i % CONFIG.toneCount) + 1,
        'aria-pressed': String(name === chosen),
        'aria-label': label,
        title: label,
        'data-focus-key': `pick-${area}-${name}`,
        onclick: () => { ui.drafts.catIcon = name; ctx.rerender(); },
      }, icon(name))),
    ),
    h('div', { class: 'add-form' },
      h('button', { class: 'btn btn--primary', type: 'submit' }, 'Anlegen'),
      h('button', { class: 'btn btn--ghost', type: 'button', onclick: close }, 'Abbrechen'),
    ),
  );
}
