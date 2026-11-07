// Einstiegspunkt: baut Navigation und Ansichten auf, kümmert sich um
// das Routing per URL-Hash (#/liste, #/vorrat) und zeichnet bei Änderungen neu.
import { CONFIG } from './config.js';
import { VIEWS } from './views/index.js';
import { state, subscribe, startSync, onError, logout } from './store.js';
import { renderLogin } from './ui/login.js';
import { icon } from './ui/art.js';
import { h } from './util.js';
import { showToast } from './ui/toast.js';

const navList = document.getElementById('nav-list');
const viewsEl = document.getElementById('views');
const offlineHint = document.getElementById('offline-hint');
const appEl = document.querySelector('.app');
const loginScreen = document.getElementById('login-screen');
const footer = document.getElementById('app-footer');

const ctx = { rerender: render };
const parts = new Map(); // id -> { view, section, link, badge }

// ---------- Navigation und Bereiche für jede Ansicht anlegen ----------
for (const view of VIEWS) {
  const badge = h('span', { class: 'badge', hidden: true });
  const link = h('a', { class: 'nav__link', href: `#/${view.id}` },
    h('span', { class: 'nav__icon' }, icon(view.icon)),
    h('span', { class: 'nav__label' }, view.navLabel || view.label),
    badge,
  );
  navList.append(h('li', {}, link));

  const section = h('section', {
    class: [
      'view', `view--${view.id}`,
      CONFIG.split?.main === view.id && 'view--split-main',
      CONFIG.split?.aside === view.id && 'view--split-aside',
    ],
    id: `view-${view.id}`,
    'aria-labelledby': `title-${view.id}`,
  });
  viewsEl.append(section);
  parts.set(view.id, { view, section, link, badge });
}

// ---------- Routing ----------
function routeFromHash() {
  const id = location.hash.replace(/^#\/?/, '').split(/[/?]/)[0];
  return parts.has(id) ? id : null;
}

function applyRoute() {
  let id = routeFromHash();
  if (!id) {
    id = CONFIG.defaultRoute;
    history.replaceState(null, '', `#/${id}`);
  }
  const changed = document.body.dataset.route !== id;
  document.body.dataset.route = id;
  const split = CONFIG.split && [CONFIG.split.main, CONFIG.split.aside].includes(id);
  document.body.classList.toggle('is-split', Boolean(split));

  for (const [viewId, p] of parts) {
    const active = viewId === id;
    p.section.classList.toggle('is-active', active);
    if (active) p.link.setAttribute('aria-current', 'page');
    else p.link.removeAttribute('aria-current');
  }
  if (changed) window.scrollTo(0, 0);
}

// ---------- Zeichnen ----------
// Merkt sich das fokussierte Element (über data-focus-key) und stellt den
// Fokus nach dem Neuzeichnen wieder her – wichtig für Tastatur und Eingabefelder.
function withFocusPreserved(fn) {
  const active = document.activeElement;
  const key = active?.dataset?.focusKey;
  const selection = key && typeof active.selectionStart === 'number'
    ? [active.selectionStart, active.selectionEnd] : null;
  fn();
  if (!key) return;
  const next = document.querySelector(`[data-focus-key="${CSS.escape(key)}"]`);
  if (!next) return;
  next.focus({ preventScroll: true });
  if (selection && next.setSelectionRange) {
    try { next.setSelectionRange(...selection); } catch { /* egal */ }
  }
}

function render() {
  // Anmeldeseite statt App, solange nicht angemeldet
  if (state.needsLogin) {
    if (loginScreen.hidden) {
      appEl.hidden = true;
      loginScreen.hidden = false;
      renderLogin(loginScreen);
      loginScreen.querySelector('input')?.focus();
    }
    document.title = `${CONFIG.appName} – Anmelden`;
    return;
  }
  if (!loginScreen.hidden) {
    loginScreen.hidden = true;
    loginScreen.replaceChildren();
    appEl.hidden = false;
  }

  offlineHint.hidden = state.online;
  footer.hidden = !state.authEnabled;
  if (state.authEnabled && !footer.firstChild) {
    footer.append(h('button', {
      class: 'btn btn--ghost btn--small', type: 'button',
      onclick: () => { if (confirm('Dieses Gerät wirklich abmelden?')) logout(); },
    }, 'Auf diesem Gerät abmelden'));
  }
  withFocusPreserved(() => {
    for (const p of parts.values()) {
      p.section.replaceChildren(...[p.view.render(state, ctx)].flat().filter(Boolean));
    }
  });
  for (const p of parts.values()) {
    const n = p.view.badge?.(state) || 0;
    p.badge.hidden = n === 0;
    p.badge.textContent = n;
  }
  const missing = parts.get('liste')?.view.badge?.(state) || 0;
  document.title = missing ? `(${missing}) ${CONFIG.appName}` : CONFIG.appName;
}

// ---------- Start ----------
onError((msg) => showToast(msg, { variant: 'error' }));
subscribe(render);
window.addEventListener('hashchange', applyRoute);
applyRoute();
render();
startSync();
