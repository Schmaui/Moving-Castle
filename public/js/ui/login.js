// Anmeldeseite (erscheint nur, wenn der Server ein Passwort verlangt).
import { h } from '../util.js';
import { login } from '../store.js';
import { CONFIG } from '../config.js';

let error = '';
let busy = false;

/** Zeichnet die Anmeldeseite in das Element root. */
export function renderLogin(root) {
  const input = h('input', {
    class: 'input', type: 'password', name: 'password', id: 'login-password',
    autocomplete: 'current-password', enterkeyhint: 'go', required: true,
    placeholder: 'Haushalts-Passwort', 'aria-describedby': error ? 'login-error' : null,
  });

  const form = h('form', {
    class: 'card card--note login',
    'data-tone': 1,
    onsubmit: async (e) => {
      e.preventDefault();
      if (busy || !input.value) return;
      busy = true;
      error = '';
      button.disabled = true;
      try {
        await login(input.value);
        input.value = '';
      } catch (err) {
        error = err.status ? err.message : 'Server nicht erreichbar – bist du online?';
        renderLogin(root);
        root.querySelector('#login-password')?.focus();
      } finally {
        busy = false;
        button.disabled = false;
      }
    },
  },
    h('img', { class: 'login__art', src: 'img/tuer.svg', alt: '' }),
    h('p', { class: 'login__welcome hand' }, 'Willkommen im'),
    h('h1', { class: 'login__title' }, CONFIG.appName),
    h('p', { class: 'login__text hand' }, 'Kurz das Haushalts-Passwort, dann geht’s los ♡'),
    h('label', { class: 'visually-hidden', for: 'login-password' }, 'Passwort'),
    input,
    error && h('p', { class: 'login__error', id: 'login-error', role: 'alert' }, error),
    h('button', { class: 'btn btn--primary login__button', type: 'submit' }, 'Reinkommen'),
    h('p', { class: 'login__small muted' }, 'Dieses Gerät bleibt danach angemeldet.'),
  );
  const button = form.querySelector('button');

  root.replaceChildren(form);
}
