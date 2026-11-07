// Ansicht "Einkaufsliste" (/#/liste): zeigt nur, was fehlt.
// Antippen = gekauft -> verschwindet, mit "Rückgängig".
import { h, plural, formatAmount, formatWhen } from '../util.js';
import { viewHeader, categoryHeader, emptyState, loading, toneOf, iconLabel } from '../ui/components.js';
import { setMissing, areaOf, personById, buyItem, updateItem, addWish, deleteWish, restoreWish, recipeById } from '../store.js';
import { stepper } from './kochen.js';
import { formatQty } from '../recipes.js';
import { avatar, byline } from '../ui/people.js';
import { icon } from '../ui/art.js';
import { showToast } from '../ui/toast.js';

const CHECK_ANIMATION_MS = 350;
const checking = new Set(); // Artikel, die gerade abgehakt werden (kurze Animation)
const RECENT_DAYS = 3;      // "Zuletzt gekauft": so viele Tage zurück
const RECENT_MAX = 6;
const buyAmount = {};       // wie viel gerade eingekauft wird (Artikel mit Mengen)
const wish = { draft: '', open: true };

/** Hat der Artikel Mengen (Menge oder Mindestmenge)? */
const counted = (item) => item.minQty != null || item.quantity != null;
/** Vorschlag beim Einkaufen: auf die Mindestmenge auffüllen (mindestens 1). */
const defaultBuy = (item) => Math.max(1, Math.ceil((item.minQty ?? 0) - (item.quantity ?? 0)));

export default {
  id: 'liste',
  label: 'Einkaufsliste',
  navLabel: 'Liste',
  icon: 'korb',   // Symbolname aus js/ui/art.js

  // Zahl im Badge der Navigation: Einkaufsliste + Wunschzettel
  badge: (state) => state.items.filter((i) => i.missing).length + (state.wishes || []).length,

  render(state, ctx) {
    if (!state.loaded) return loading();
    const missing = state.items.filter((i) => i.missing);

    const header = viewHeader({
      id: 'title-liste',
      title: 'Einkaufsliste',
      subtitle: missing.length ? plural(missing.length, 'Artikel fehlt', 'Artikel fehlen') : 'Alles da',
    });

    if (missing.length === 0) {
      return [header, emptyState({
        art: 'img/leer-tee.svg',
        title: 'Alles da!',
        text: 'Zeit für einen Tee. Was fehlt, tippst du im Vorrat an.',
        action: h('a', { class: 'btn', href: '#/vorrat' }, iconLabel('regal', 'Zum Vorrat')),
      }), h('div', { class: 'cards' }, wishCard(state, ctx), recentCard(state))];
    }

    // Erst Essen (Vorrat), darunter ein eigener Abschnitt "Haushalt" (Bad, Putzen …)
    const cardsFor = (area) => state.categories
      .filter((cat) => areaOf(cat) === area)
      .map((cat) => ({ cat, items: missing.filter((i) => i.categoryId === cat.id) }))
      .filter((g) => g.items.length > 0)
      .map(({ cat, items }) =>
        h('section', { class: 'card card--note', 'data-tone': toneOf(cat) },
          categoryHeader(cat, h('span', { class: 'card__meta' }, `${items.length}×`)),
          h('ul', { class: 'check-list' }, items.map((item) => h('li', { class: counted(item) ? 'has-amount' : null },
            checkRow(item, ctx),
            // Artikel mit Mengen: wie viel wird gekauft? (Vorschlag: bis zur Mindestmenge)
            counted(item) && h('span', { class: 'buy-amount' },
              h('span', { class: 'buy-amount__label' }, 'kaufe'),
              stepper(buyAmount[item.id] ?? defaultBuy(item), item.unit,
                (v) => { buyAmount[item.id] = Math.max(1, v); ctx.rerender(); }, `buy-${item.id}`),
            ),
          ))),
        ));
    const food = cardsFor('kueche');
    const house = cardsFor('haushalt');
    const houseIds = new Set(state.categories.filter((c) => areaOf(c) === 'haushalt').map((c) => c.id));
    const houseCount = missing.filter((i) => houseIds.has(i.categoryId)).length;

    return [
      header,
      food.length > 0 && h('div', { class: 'cards' }, food),
      house.length > 0 && h('h2', { class: 'list-section' }, icon('putzmittel', { wash: false }), 'Haushalt',
        h('span', { class: 'list-section__count' }, `${houseCount}×`)),
      house.length > 0 && h('div', { class: 'cards' }, house),
      h('div', { class: 'cards' }, wishCard(state, ctx), recentCard(state)),
    ];
  },
};

function checkRow(item, ctx) {
  const amount = counted(item)
    ? `${formatQty(item.quantity ?? 0)}${item.minQty != null ? ` von mind. ${formatQty(item.minQty)}` : ''}${item.unit ? ` ${item.unit}` : ''} da`
    : formatAmount(item);
  const detail = [amount, item.note].filter(Boolean).join(' · ');
  return h('button', {
    type: 'button',
    class: ['check-row', checking.has(item.id) && 'is-checked'],
    'data-focus-key': `liste-${item.id}`,
    'aria-label': `${item.name} als gekauft abhaken`,
    onclick: () => buy(item, ctx),
  },
    h('span', { class: 'check-row__box', 'aria-hidden': 'true' }, checkMark()),
    h('span', { class: 'check-row__text' },
      h('span', { class: 'check-row__name' }, item.name),
      detail && h('span', { class: 'check-row__detail' }, detail),
    ),
    // wer hat's auf die Liste gesetzt
    avatar(personById(item.missingBy), { size: 'sm', className: 'check-row__who' }),
  );
}

function buy(item, ctx) {
  if (checking.has(item.id)) return;
  checking.add(item.id);
  ctx.rerender();
  const before = item.quantity;
  setTimeout(() => {
    checking.delete(item.id);
    if (counted(item)) {
      const bought = buyAmount[item.id] ?? defaultBuy(item);
      delete buyAmount[item.id];
      buyItem(item, (item.quantity ?? 0) + bought);
      showToast(`„${item.name}“ gekauft (+${formatQty(bought)}${item.unit ? ` ${item.unit}` : ''})`, {
        actionLabel: 'Rückgängig',
        onAction: () => updateItem(item, { missing: true, quantity: before }),
      });
      return;
    }
    setMissing(item, false);
    showToast(`„${item.name}“ gekauft`, {
      actionLabel: 'Rückgängig',
      onAction: () => setMissing(item, true),
    });
  }, CHECK_ANIMATION_MS);
}

/** Gezeichnetes Häkchen – "zeichnet sich" beim Abhaken selbst (CSS in components.css). */
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

/** "Zuletzt gekauft": wer hat was gekauft – und mit einem Tipp wieder auf die Liste. */
function recentCard(state) {
  const since = Date.now() - RECENT_DAYS * 86400000;
  const recent = state.items
    .filter((i) => !i.missing && i.boughtAt && Date.parse(i.boughtAt) > since)
    .sort((a, b) => b.boughtAt.localeCompare(a.boughtAt))
    .slice(0, RECENT_MAX);
  if (!recent.length) return null;
  return h('section', { class: 'card card--note card--recent', 'data-tone': 6 },
    h('div', { class: 'card__header' },
      h('span', { class: 'card__icon' }, icon('korb')),
      h('h2', { class: 'card__title' }, 'Zuletzt gekauft'),
    ),
    h('ul', { class: 'recent-list' }, recent.map((item) => h('li', { class: 'recent' },
      h('span', { class: 'recent__text' },
        h('span', { class: 'recent__name' }, item.name),
        byline(item.boughtBy, formatWhen(item.boughtAt)),
      ),
      h('button', {
        type: 'button', class: 'pill', 'data-focus-key': `again-${item.id}`,
        'aria-label': `${item.name} wieder auf die Liste`,
        onclick: () => {
          setMissing(item, true);
          showToast(`„${item.name}“ steht wieder auf der Liste`);
        },
      }, icon('plus', { wash: false }), 'nochmal'),
    ))),
  );
}

/** Wunschzettel: Sachen, die ihr nicht immer da haben wollt (z. B. Zutaten für ein Rezept). */
function wishCard(state, ctx) {
  const wishes = state.wishes || [];
  return h('section', { class: 'card card--note card--wish', 'data-tone': 5 },
    h('div', { class: 'card__header' },
      h('span', { class: 'card__icon' }, icon('herz')),
      h('h2', { class: 'card__title' }, 'Wunschzettel'),
      wishes.length > 0 && h('span', { class: 'card__meta' }, `${wishes.length}×`),
      h('button', {
        type: 'button', class: 'btn btn--icon btn--ghost', 'aria-expanded': String(wish.open),
        'aria-label': wish.open ? 'Wunschzettel zuklappen' : 'Wunschzettel aufklappen', 'data-focus-key': 'wish-toggle',
        onclick: () => { wish.open = !wish.open; ctx.rerender(); },
      }, icon(wish.open ? 'minus' : 'plus', { wash: false })),
    ),
    wish.open && [
      wishes.length === 0 && h('p', { class: 'muted wish-hint' }, 'Was ihr nicht immer da haben wollt – z. B. Zutaten für ein Rezept.'),
      h('ul', { class: 'check-list' }, wishes.map((w) => h('li', {}, h('button', {
        type: 'button', class: ['check-row', checking.has(`w${w.id}`) && 'is-checked'],
        'data-focus-key': `wish-${w.id}`, 'aria-label': `${w.name} als gekauft abhaken`,
        onclick: () => buyWish(w, ctx),
      },
        h('span', { class: 'check-row__box', 'aria-hidden': 'true' }, checkMark()),
        h('span', { class: 'check-row__text' },
          h('span', { class: 'check-row__name' }, w.name),
          h('span', { class: 'check-row__detail' },
            [w.amount, w.recipeId && recipeById(w.recipeId) && `für ${recipeById(w.recipeId).title}`].filter(Boolean).join(' · ')),
        ),
        avatar(personById(w.addedBy), { size: 'sm', className: 'check-row__who' }),
      )))),
      h('form', {
        class: 'add-form',
        onsubmit: async (e) => {
          e.preventDefault();
          const name = wish.draft.trim();
          if (!name) return;
          wish.draft = '';
          if (!(await addWish(name))) wish.draft = name;
          ctx.rerender();
        },
      },
        h('input', {
          class: 'input', type: 'text', maxlength: 80, placeholder: 'Noch was dazu …', 'aria-label': 'Auf den Wunschzettel',
          'data-focus-key': 'wish-new', autocomplete: 'off', enterkeyhint: 'done', value: wish.draft,
          oninput: (e) => { wish.draft = e.target.value; },
        }),
        h('button', { class: 'btn', type: 'submit' }, 'Dazu'),
      ),
    ],
  );
}

function buyWish(w, ctx) {
  const key = `w${w.id}`;
  if (checking.has(key)) return;
  checking.add(key);
  ctx.rerender();
  setTimeout(() => {
    checking.delete(key);
    deleteWish(w);
    showToast(`„${w.name}“ gekauft`, { actionLabel: 'Rückgängig', onAction: () => restoreWish(w) });
  }, CHECK_ANIMATION_MS);
}
