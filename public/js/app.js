// Einstiegspunkt: baut Navigation und Ansichten auf, kümmert sich um
// das Routing per URL-Hash (#/liste, #/vorrat) und zeichnet bei Änderungen neu.
import { CONFIG } from './config.js';
import { VIEWS } from './views/index.js';
import { state, subscribe, startSync, onError, me } from './store.js';
import { renderPersonPicker } from './ui/people.js';
import { renderLogin } from './ui/login.js';
import { icon } from './ui/art.js';
import { h } from './util.js';
import { showToast } from './ui/toast.js';

const navList = document.getElementById('nav-list');
const viewsEl = document.getElementById('views');
const offlineHint = document.getElementById('offline-hint');
const appEl = document.querySelector('.app');
const loginScreen = document.getElementById('login-screen');
const whoScreen = document.getElementById('who-screen');

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
  // inNav: false -> kein eigener Knopf (z. B. Haushalt und Kochen liegen unter "Küche")
  if (view.inNav !== false) navList.append(h('li', {}, link));

  const section = h('section', {
    class: [
      'view', `view--${view.id}`,
      CONFIG.split?.aside === view.id && 'view--split-aside',
    ],
    id: `view-${view.id}`,
    'aria-labelledby': `title-${view.id}`,
  });
  viewsEl.append(section);
  parts.set(view.id, { view, section, link, badge });
}

// ---------- Routing ----------
let lastHash = null;
let splitMain = [CONFIG.split?.main].flat()[0];
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
  // auch Unterseiten (z. B. #/kochen/rezept/3) -> nach oben scrollen
  const changed = document.body.dataset.route !== id || lastHash !== location.hash;
  lastHash = location.hash;
  document.body.dataset.route = id;
  // PC: Hauptansicht (Vorrat oder Haushalt) links, Einkaufsliste rechts.
  // Bei der Liste selbst bleibt links die zuletzt benutzte Hauptansicht stehen.
  const mains = [CONFIG.split?.main].flat().filter(Boolean);
  if (mains.includes(id)) splitMain = id;
  const split = CONFIG.split && (mains.includes(id) || id === CONFIG.split.aside);
  document.body.classList.toggle('is-split', Boolean(split));

  for (const [viewId, p] of parts) {
    p.section.classList.toggle('is-active', viewId === id);
    p.section.classList.toggle('view--split-main', viewId === splitMain);
    // Knopf leuchtet auch für Unterbereiche (Küche: Vorrat, Haushalt, Kochen)
    const current = viewId === id || (p.view.navAlso || []).includes(id);
    if (current) p.link.setAttribute('aria-current', 'page');
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

  // "Wer bist du?" – solange auf diesem Gerät noch niemand gewählt ist
  const needsPerson = state.loaded && state.people.length > 0 && !me();
  if (needsPerson && whoScreen.hidden) {
    whoScreen.hidden = false;
    renderPersonPicker(whoScreen, render);
    whoScreen.querySelector('.who')?.focus();
  } else if (!needsPerson && !whoScreen.hidden) {
    whoScreen.hidden = true;
    whoScreen.replaceChildren();
  }

  offlineHint.hidden = state.online;
  // gemeinsame Einstellungen anwenden (Farbe der Kühlschranktür, siehe css/tokens.css)
  document.body.dataset.fridge = state.settings?.fridgeColor || 'mauve';
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
window.addEventListener('hashchange', () => { applyRoute(); render(); });
applyRoute();
render();
startSync();
