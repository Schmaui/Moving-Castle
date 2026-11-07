// Profile: kleine runde Sticker (Avatar) mit eigenem Foto oder gezeichneter Figur,
// und die Frage "Wer bist du?" beim ersten Öffnen auf einem Gerät.
import { h } from '../util.js';
import { api } from '../api.js';
import { icon } from './art.js';
import { setMyId } from '../me.js';
import { state, personById } from '../store.js';

/**
 * Avatar einer Person.
 *   avatar(person)                     -> klein (z. B. neben einem Artikel)
 *   avatar(person, { size: 'lg' })     -> groß (Einstellungen, "Wer bist du?")
 * Größen: xs, sm, md, lg, xl. Mit label wird der Name für Screenreader vorgelesen.
 */
export function avatar(person, { size = 'sm', label = false, className } = {}) {
  if (!person) return null;
  return h('span', {
    class: ['avatar', `avatar--${size}`, className],
    'data-tone': person.tone || 1,
    title: person.name,
    role: label ? 'img' : null,
    'aria-label': label ? person.name : null,
    'aria-hidden': label ? null : 'true',
  },
    person.photo
      ? h('img', { src: api.avatarUrl(person), alt: '', loading: 'lazy', decoding: 'async' })
      : icon(person.figure),
  );
}

/** Kleiner Hinweis "Kait · heute 14:30" mit Avatar. */
export function byline(personId, text) {
  const person = personById(personId);
  if (!person && !text) return null;
  return h('span', { class: 'byline' },
    avatar(person, { size: 'xs' }),
    h('span', {}, [person?.name, text].filter(Boolean).join(' · ')),
  );
}

/** Auswahl "Wer bist du?" – erscheint, solange auf diesem Gerät niemand gewählt ist. */
export function renderPersonPicker(root, onChosen) {
  root.replaceChildren(
    h('div', { class: 'card card--note who', 'data-tone': 3, tabindex: '-1', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'who-title' },
      h('h1', { class: 'who__title', id: 'who-title' }, 'Wer bist du?'),
      h('p', { class: 'who__text hand' }, 'Damit ihr seht, wer was eingetragen und erledigt hat ♡'),
      h('div', { class: 'who__people' }, state.people.map((person) => h('button', {
        type: 'button',
        class: 'who__person',
        'data-person': person.id,
        onclick: () => { setMyId(person.id); onChosen(); },
      }, avatar(person, { size: 'xl' }), h('span', { class: 'who__name' }, person.name)))),
      h('p', { class: 'who__small muted' }, 'Das merkt sich dieses Gerät. Ändern kannst du es unter „Mehr“.'),
    ),
  );
}
