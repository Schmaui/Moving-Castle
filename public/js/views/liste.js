// Ansicht "Einkaufsliste" (/#/liste): zeigt nur, was fehlt.
// Antippen = gekauft -> verschwindet, mit "Rückgängig".
import { h, plural, formatAmount } from '../util.js';
import { viewHeader, categoryHeader, emptyState, loading, toneOf, iconLabel } from '../ui/components.js';
import { setMissing } from '../store.js';
import { showToast } from '../ui/toast.js';

const CHECK_ANIMATION_MS = 350;
const checking = new Set(); // Artikel, die gerade abgehakt werden (kurze Animation)

export default {
  id: 'liste',
  label: 'Einkaufsliste',
  navLabel: 'Liste',
  icon: 'korb',   // Symbolname aus js/ui/art.js

  // Zahl im Badge der Navigation
  badge: (state) => state.items.filter((i) => i.missing).length,

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
      })];
    }

    const cards = state.categories
      .map((cat) => ({ cat, items: missing.filter((i) => i.categoryId === cat.id) }))
      .filter((g) => g.items.length > 0)
      .map(({ cat, items }) =>
        h('section', { class: 'card card--note', 'data-tone': toneOf(cat) },
          categoryHeader(cat, h('span', { class: 'card__meta' }, `${items.length}×`)),
          h('ul', { class: 'check-list' }, items.map((item) => h('li', {}, checkRow(item, ctx)))),
        ));

    return [header, h('div', { class: 'cards' }, cards)];
  },
};

function checkRow(item, ctx) {
  const amount = formatAmount(item);
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
  );
}

function buy(item, ctx) {
  if (checking.has(item.id)) return;
  checking.add(item.id);
  ctx.rerender();
  setTimeout(() => {
    checking.delete(item.id);
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
