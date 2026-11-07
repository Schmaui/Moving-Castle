// Kurzer Hinweis unten am Bildschirm, optional mit Knopf (z. B. "Rückgängig").
import { h } from '../util.js';
import { CONFIG } from '../config.js';

let current = null;

export function showToast(message, { actionLabel, onAction, duration = CONFIG.undoDurationMs, variant } = {}) {
  current?.close(true);
  const region = document.getElementById('toast-region');
  let timer;

  const close = (instant = false) => {
    clearTimeout(timer);
    if (current?.el === el) current = null;
    if (instant) return el.remove();
    el.classList.remove('is-visible');
    setTimeout(() => el.remove(), 250);
  };

  const el = h('div', {
    class: ['toast', variant === 'error' && 'toast--error'],
    role: variant === 'error' ? 'alert' : 'status',
  },
    h('span', { class: 'toast__msg' }, message),
    actionLabel && h('button', {
      class: 'toast__action',
      type: 'button',
      onclick: () => { close(); onAction?.(); },
    }, actionLabel),
  );

  region.append(el);
  requestAnimationFrame(() => el.classList.add('is-visible'));
  timer = setTimeout(close, duration);
  current = { el, close };
}
