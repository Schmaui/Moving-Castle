// Kleine Animationen (Web Animations API – erlaubt trotz strenger CSP, keine Inline-Styles nötig).
//
// Warum nicht einfach CSS-Animationen? Die App zeichnet bei jeder Änderung alle Ansichten neu
// (app.js). Eine CSS-Animation würde dann bei jedem Abgleich wieder von vorn losgehen.
// Deshalb merkt sich dieses Modul, WANN eine Animation gestartet ist, und setzt sie nach dem
// Neuzeichnen an genau dieser Stelle fort (afterRender wird von app.js aufgerufen).
//
//   play(key, kind)        Animation für Elemente mit data-fx="key" starten (z. B. Popcorn ploppt)
//   fxKey(key)             Attribute für h(): { 'data-fx': key }
//   enter(key, createdAt)  Attribute für frisch angelegte Dinge -> "kleben" an die Tür (einmalig,
//                          erst wenn man es wirklich sieht – z. B. Foto unter "Mehr" angelegt,
//                          klebt sich an, sobald ihr die Küche öffnet)
//   wiggle(el)             kurz wackeln (Foto antippen), Promise -> danach groß öffnen
//   flyTo(el, target)      Kopie von el fliegt zu target (Abhaken -> Korb)
//   hearts(el)             kleine Herzen steigen auf (Aufgabe erledigt)
//   pageIn(el, dir)        Seite rutscht herein wie beim Umblättern (dir 1 = von rechts, -1 = von links)
//   (Kühlschranktür beim Start + Nachrichten an der Tür: siehe ui/door.js)
//
// Alle Animationen entfallen, wenn am Gerät "Bewegung reduzieren" eingeschaltet ist.
import { h } from '../util.js';
import { icon } from './art.js';

const calm = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// ---------- Bewegungen ----------
const KINDS = {
  // Popcorn ploppt beim Bewerten
  pop: {
    frames: [
      { transform: 'scale(1)' },
      { transform: 'scale(1.45) translateY(-6px) rotate(-10deg)', offset: 0.35 },
      { transform: 'scale(0.92) rotate(4deg)', offset: 0.7 },
      { transform: 'scale(1)' },
    ],
    duration: 420, easing: 'ease-out',
  },
  // Zettel / Foto / Kinokarte wird an die Tür geklebt
  stick: {
    frames: [
      { opacity: 0, transform: 'translateY(-28px) scale(1.08) rotate(-6deg)' },
      { opacity: 1, transform: 'translateY(3px) scale(0.99) rotate(1.5deg)', offset: 0.6 },
      { transform: 'translateY(0) scale(1) rotate(-0.6deg)', offset: 0.82 },
      { opacity: 1, transform: 'none' },
    ],
    duration: 560, easing: 'cubic-bezier(.3,.7,.4,1)',
  },
  // Vorhang (linke / rechte Hälfte) geht auf
  'curtain-left': {
    frames: [{ transform: 'translateX(0)' }, { transform: 'translateX(-102%)' }],
    duration: 700, easing: 'cubic-bezier(.6,.05,.3,1)', fill: 'both',
  },
  'curtain-right': {
    frames: [{ transform: 'translateX(0)' }, { transform: 'translateX(102%)' }],
    duration: 700, easing: 'cubic-bezier(.6,.05,.3,1)', fill: 'both',
  },
};

const running = new Map();       // key -> { kind, start }
const done = new WeakSet();      // Elemente, die schon animiert werden
const seen = new Set();          // enter(): diese Dinge sind schon "angeklebt"
const FRESH_MS = 90000;          // so lange gilt etwas als "gerade eben angelegt"

export const fxKey = (key) => ({ 'data-fx': key });

/** Animation für alle Elemente mit data-fx="key" starten (auch nach Neuzeichnen). */
export function play(key, kind) {
  if (calm() || !KINDS[kind]) return;
  running.set(key, { kind, start: performance.now() });
  setTimeout(() => {
    const r = running.get(key);
    if (r && performance.now() - r.start >= KINDS[kind].duration) running.delete(key);
  }, KINDS[kind].duration + 50);
  queueMicrotask(() => afterRender(document));
}

/** Für frisch angelegte Einträge: einmal an die Tür kleben (auch wenn das andere Handy es anlegt). */
export function enter(key, createdAt) {
  if (seen.has(key) || running.has(key)) return { 'data-fx': key };
  return { 'data-fx': key, 'data-fx-born': createdAt || '' };
}

/** enter(): Erst wenn das Element zum ersten Mal sichtbar ist, entscheiden, ob es sich anklebt. */
function checkEntering(root) {
  for (const el of root.querySelectorAll('[data-fx-born]')) {
    const key = el.dataset.fx;
    if (seen.has(key) || running.has(key) || !el.getClientRects().length) continue; // noch versteckt
    seen.add(key);
    const age = Date.now() - Date.parse(el.dataset.fxBorn);
    if (calm() || !(age < FRESH_MS && age > -FRESH_MS)) continue;
    running.set(key, { kind: 'stick', start: performance.now() });
    setTimeout(() => running.delete(key), KINDS.stick.duration + 50);
  }
}

/** Nach jedem Neuzeichnen: laufende Animationen an den neuen Elementen fortsetzen. */
export function afterRender(root = document) {
  checkEntering(root);
  if (!running.size) return;
  for (const el of root.querySelectorAll('[data-fx]')) {
    if (done.has(el)) continue;
    const r = running.get(el.dataset.fx);
    if (!r) continue;
    const def = KINDS[r.kind];
    const elapsed = performance.now() - r.start;
    if (elapsed >= def.duration) continue;
    done.add(el);
    const anim = el.animate(def.frames, { duration: def.duration, easing: def.easing, fill: def.fill || 'none' });
    anim.currentTime = elapsed;
    // "both" nur während der Animation – danach gilt wieder das CSS
    if (def.fill) anim.finished.then(() => anim.cancel()).catch(() => {});
  }
}

// ---------- Einmalige Effekte (unabhängig vom Neuzeichnen) ----------

/** Eine Kopie von el fliegt zu target und verschwindet (z. B. Artikel -> Korb). */
export function flyTo(el, target) {
  if (calm() || !el?.isConnected || !target) return;
  const from = el.getBoundingClientRect();
  const to = target.getBoundingClientRect();
  if (!from.width || !to.width) return;
  const ghost = el.cloneNode(true);
  ghost.removeAttribute('data-focus-key');
  ghost.setAttribute('aria-hidden', 'true');
  ghost.classList.add('fx-ghost');
  const box = h('div', { class: 'fx-layer', 'aria-hidden': 'true' }, ghost);
  document.body.append(box);
  ghost.style.left = `${from.left}px`;
  ghost.style.top = `${from.top}px`;
  ghost.style.width = `${from.width}px`;
  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);
  const anim = ghost.animate([
    { transform: 'translate(0, 0) scale(1) rotate(0)', opacity: 1 },
    { transform: `translate(${dx * 0.35}px, ${dy * 0.35 - 60}px) scale(0.7) rotate(-8deg)`, opacity: 1, offset: 0.4 },
    { transform: `translate(${dx}px, ${dy}px) scale(0.12) rotate(14deg)`, opacity: 0.2 },
  ], { duration: 650, easing: 'cubic-bezier(.45,.05,.55,.95)', fill: 'forwards' });
  anim.finished.then(() => {
    box.remove();
    target.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.25) rotate(-8deg)' }, { transform: 'scale(1)' }],
      { duration: 320, easing: 'ease-out' });
  }).catch(() => box.remove());
}

/** Kleine Herzen steigen von el aus auf. */
export function hearts(el, count = 6) {
  if (calm() || !el?.isConnected) return;
  const r = el.getBoundingClientRect();
  const layer = h('div', { class: 'fx-layer', 'aria-hidden': 'true' });
  document.body.append(layer);
  const anims = [];
  for (let i = 0; i < count; i++) {
    const heart = h('span', { class: 'fx-heart' }, icon('herz'));
    layer.append(heart);
    heart.style.left = `${r.left + r.width / 2 - 11}px`;
    heart.style.top = `${r.top + r.height / 2 - 11}px`;
    const dx = (Math.random() - 0.5) * 90;
    const dy = -60 - Math.random() * 70;
    const spin = (Math.random() - 0.5) * 50;
    anims.push(heart.animate([
      { transform: 'translate(0, 0) scale(0.3)', opacity: 0 },
      { transform: `translate(${dx * 0.4}px, ${dy * 0.4}px) scale(1.1) rotate(${spin / 2}deg)`, opacity: 1, offset: 0.3 },
      { transform: `translate(${dx}px, ${dy}px) scale(0.8) rotate(${spin}deg)`, opacity: 0 },
    ], { duration: 900 + Math.random() * 300, delay: i * 45, easing: 'cubic-bezier(.2,.7,.4,1)', fill: 'both' }).finished);
  }
  Promise.allSettled(anims).then(() => layer.remove());
}

/** Seite rutscht herein wie beim Umblättern (dir 1 = von rechts, -1 = von links, 0 = von unten). */
export function pageIn(el, dir = 1) {
  if (calm() || !el) return;
  const from = dir === 0 ? 'translateY(26px)' : `translateX(${dir * 56}px) rotate(${dir * 0.8}deg)`;
  el.animate([
    { opacity: 0, transform: from },
    { opacity: 1, transform: 'none' },
  ], { duration: 340, easing: 'cubic-bezier(.2,.8,.25,1)' });
}

/** Kurz wackeln (z. B. Foto antippen). Ohne Bewegung sofort fertig. */
export function wiggle(el) {
  if (calm() || !el) return Promise.resolve();
  return el.animate([
    { transform: 'rotate(0) scale(1)' },
    { transform: 'rotate(-7deg) scale(1.06)', offset: 0.2 },
    { transform: 'rotate(6deg) scale(1.06)', offset: 0.45 },
    { transform: 'rotate(-3deg) scale(1.03)', offset: 0.7 },
    { transform: 'rotate(0) scale(1)' },
  ], { duration: 380, easing: 'ease-in-out' }).finished.then(() => {}, () => {});
}
