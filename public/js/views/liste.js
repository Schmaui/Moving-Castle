// Ansicht "Einkaufsliste" (/#/liste): zeigt nur, was fehlt.
// Antippen = gekauft -> verschwindet, mit "Rückgängig".
import { h, plural, formatAmount, formatWhen } from '../util.js';
import { viewHeader, categoryHeader, emptyState, loading, toneOf, iconLabel } from '../ui/components.js';
import { setMissing, personById } from '../store.js';
import { avatar, byline } from '../ui/people.js';
import { icon } from '../ui/art.js';
import { showToast } from '../ui/toast.js';

const CHECK_ANIMATION_MS = 350;
const checking = new Set(); // Artikel, die gerade abgehakt werden (kurze Animation)
const RECENT_DAYS = 3;      // "Zuletzt gekauft": so viele Tage zurück
const RECENT_MAX = 6;

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
      }), h('div', { class: 'cards' }, recentCard(state))];
    }

    const cards = state.categories
      .map((cat) => ({ cat, items: missing.filter((i) => i.categoryId === cat.id) }))
      .filter((g) => g.items.length > 0)
      .map(({ cat, items }) =>
        h('section', { class: 'card card--note', 'data-tone': toneOf(cat) },
          categoryHeader(cat, h('span', { class: 'card__meta' }, `${items.length}×`)),
          h('ul', { class: 'check-list' }, items.map((item) => h('li', {}, checkRow(item, ctx)))),
        ));

    return [header, h('div', { class: 'cards' }, cards, recentCard(state))];
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
    // wer hat's auf die Liste gesetzt
    avatar(personById(item.missingBy), { size: 'sm', className: 'check-row__who' }),
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
