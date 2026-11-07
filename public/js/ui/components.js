// Wiederverwendbare Bausteine für alle Ansichten.
import { h } from '../util.js';
import { CONFIG } from '../config.js';
import { icon } from './art.js';

/** Farbton einer Kategorie (1 … toneCount), bleibt pro Kategorie immer gleich. */
export const toneOf = (category) => ((category.id - 1) % CONFIG.toneCount) + 1;

/** Kopfbereich einer Ansicht: Titel, Untertitel, Knöpfe rechts. */
export function viewHeader({ id, title, subtitle, actions = [] }) {
  return h('header', { class: 'view-header' },
    h('div', {},
      h('h1', { class: 'view-header__title', id, tabindex: '-1' }, title),
      subtitle && h('p', { class: 'view-header__subtitle' }, subtitle),
    ),
    actions.length > 0 && h('div', { class: 'view-header__actions' }, actions),
  );
}

/** Kartenkopf einer Kategorie: gezeichnetes Symbol + Name + beliebiges rechts. */
export function categoryHeader(category, ...right) {
  return h('div', { class: 'card__header' },
    h('span', { class: 'card__icon' }, icon(category.icon)),
    h('h2', { class: 'card__title' }, category.name),
    ...right,
  );
}

/** Leerer Zustand ("Nichts zu tun"). art = Bild in public/img/, sonst symbol = Name aus art.js. */
export function emptyState({ art, symbol = 'blatt', title, text, action }) {
  return h('div', { class: 'empty' },
    art
      ? h('img', { class: 'empty__art', src: art, alt: '' })
      : h('div', { class: 'empty__symbol' }, icon(symbol)),
    h('p', { class: 'empty__title' }, title),
    text && h('p', { class: 'empty__text' }, text),
    action,
  );
}

export function loading() {
  return h('p', { class: 'muted' }, 'Lade …');
}

/** Knopf-Inhalt: gezeichnetes Symbol + Text. */
export function iconLabel(name, text) {
  return [icon(name, { wash: false, className: 'art--btn' }), text && h('span', {}, text)];
}

/** Reiter oben in der Küche: Vorrat · Haushalt · Kochen (alle unter dem Knopf "Küche"). */
export function kitchenTabs(active) {
  const tab = (id, label, iconName) => h('a', {
    class: ['kitchen-tabs__tab', active === id && 'is-active'],
    href: `#/${id}`,
    'aria-current': active === id ? 'page' : null,
  }, icon(iconName), h('span', {}, label));
  return h('nav', { class: 'kitchen-tabs', 'aria-label': 'Küche' },
    tab('vorrat', 'Vorrat', 'regal'),
    tab('haushalt', 'Haushalt', 'putzmittel'),
    tab('kochen', 'Kochen', 'topf'),
  );
}
