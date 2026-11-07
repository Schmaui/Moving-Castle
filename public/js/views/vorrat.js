// Ansicht "Vorrat" (/#/vorrat): alle Artikel als Chips pro Kategorie.
// Antippen = fehlt (rot, landet auf der Einkaufsliste). Nochmal = doch da.
// "Bearbeiten" schaltet den Löschmodus ein.
import { h, sameName } from '../util.js';
import { viewHeader, categoryHeader, loading, toneOf, iconLabel } from '../ui/components.js';
import { icon, PICKABLE } from '../ui/art.js';
import { setMissing, addItem, deleteItem, restoreItem, addCategory, deleteCategory } from '../store.js';
import { showToast } from '../ui/toast.js';
import { CONFIG } from '../config.js';

// Zustand nur dieser Ansicht (bleibt beim Neuzeichnen erhalten)
const ui = {
  editMode: false,
  addOpen: new Set(),   // Kategorien mit offenem Eingabefeld
  drafts: {},           // angefangene Eingaben
  newCategoryOpen: false,
  justToggled: null,    // Artikel, der gerade angetippt wurde (kurzes Wippen)
};

export default {
  id: 'vorrat',
  label: 'Vorrat',
  icon: 'regal',   // Symbolname aus js/ui/art.js

  render(state, ctx) {
    if (!state.loaded) return loading();
    const missingCount = state.items.filter((i) => i.missing).length;

    const header = viewHeader({
      id: 'title-vorrat',
      title: 'Vorrat',
      subtitle: ui.editMode
        ? 'Tippe an, was weg soll …'
        : `Tippe an, was fehlt ~ ${missingCount} von ${state.items.length} fehlen`,
      actions: [
        h('button', {
          type: 'button',
          class: ['btn', ui.editMode && 'btn--active'],
          'aria-pressed': String(ui.editMode),
          'data-focus-key': 'edit-toggle',
          onclick: () => { ui.editMode = !ui.editMode; ctx.rerender(); },
        }, ui.editMode ? iconLabel('haken', 'Fertig') : iconLabel('stift', 'Bearbeiten')),
      ],
    });

    const cards = state.categories.map((cat) =>
      categoryCard(cat, state.items.filter((i) => i.categoryId === cat.id), ctx));

    return [header, h('div', { class: 'cards' }, cards, newCategoryCard(ctx))];
  },
};

function categoryCard(cat, items, ctx) {
  const missing = items.filter((i) => i.missing).length;
  const canDeleteCategory = ui.editMode && items.length === 0;

  return h('section', { class: 'card', 'data-tone': toneOf(cat) },
    categoryHeader(cat,
      missing > 0 && h('span', { class: 'badge badge--soft' }, `${missing} ${missing === 1 ? 'fehlt' : 'fehlen'}`),
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
    ),
    items.length > 0
      ? h('div', { class: 'chips' }, items.map((item) => chip(item)))
      : h('p', { class: 'muted' }, 'Noch keine Artikel.'),
    ui.addOpen.has(cat.id) && addForm(cat, items, ctx),
  );
}

function chip(item) {
  if (ui.editMode) {
    return h('button', {
      type: 'button',
      class: ['chip', 'chip--delete', item.missing && 'is-missing'],
      'data-focus-key': `chip-${item.id}`,
      'aria-label': `${item.name} löschen`,
      onclick: () => {
        deleteItem(item);
        showToast(`„${item.name}“ gelöscht`, {
          actionLabel: 'Rückgängig',
          onAction: () => restoreItem(item),
        });
      },
    }, item.name, h('span', { class: 'chip__x' }, icon('kreuz', { wash: false })));
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
  }, item.missing && icon('stern', { wash: false, className: 'chip__star' }), item.name);
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

function newCategoryCard(ctx) {
  if (!ui.newCategoryOpen) {
    return h('div', { class: 'card card--new' },
      h('button', {
        type: 'button',
        class: 'btn btn--ghost',
        'data-focus-key': 'new-cat-open',
        onclick: () => {
          ui.newCategoryOpen = true;
          ctx.rerender();
          document.querySelector('[data-focus-key="new-cat-name"]')?.focus();
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
      const created = await addCategory(name, chosen);
      if (created) close();
    },
    onkeydown: (e) => { if (e.key === 'Escape') close(); },
  },
    h('h2', { class: 'card__title' }, 'Neue Kategorie'),
    h('div', { class: 'add-form' },
      h('input', {
        class: 'input', type: 'text', maxlength: 40, placeholder: 'Name, z. B. Getränke',
        'aria-label': 'Name der Kategorie', 'data-focus-key': 'new-cat-name', autocomplete: 'off',
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
        'data-focus-key': `pick-${name}`,
        onclick: () => { ui.drafts.catIcon = name; ctx.rerender(); },
      }, icon(name))),
    ),
    h('div', { class: 'add-form' },
      h('button', { class: 'btn btn--primary', type: 'submit' }, 'Anlegen'),
      h('button', { class: 'btn btn--ghost', type: 'button', onclick: close }, 'Abbrechen'),
    ),
  );
}
