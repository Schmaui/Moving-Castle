// Nachricht an die Tür: Beim Öffnen der App ist die Kühlschranktür erst zu.
//
//   - Hängt eine Nachricht vom anderen dran (jünger als 24 Std.), bleibt die Tür zu, bis man
//     sie antippt – dann schwingt sie auf.
//   - Ohne Nachricht: kurz „Hallo …“, dann geht die Tür von selbst auf.
//   - Kommt man später in die App zurück und es hängt eine NEUE Nachricht dran, ist die Tür
//     wieder zu. Kommt eine Nachricht, während man die App gerade benutzt, gibt's nur einen Hinweis.
//
// Außerdem hier: wie eine Nachricht aussieht (messageNote), gemalte Striche als Bild (drawingSvg)
// und die Malfläche zum Malen mit dem Finger (openPad).
// Geschrieben wird unter „Mehr“ (views/einstellungen.js).
import { h } from '../util.js';
import { formatWhen } from '../util.js';
import { state, subscribe, me, personById, messagesForMe } from '../store.js';
import { avatar } from './people.js';
import { showToast } from './toast.js';

const calm = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Malfläche (wie auf dem Server: server/modules/messages.js)
export const PAD = { w: 400, h: 300 };
export const INKS = [
  { id: 'tinte', label: 'Tinte' },
  { id: 'rot', label: 'Rot' },
  { id: 'blau', label: 'Blau' },
  { id: 'gruen', label: 'Grün' },
];
export const PAPERS = [
  { id: 'gelb', label: 'Gelb' },
  { id: 'rosa', label: 'Rosa' },
  { id: 'mint', label: 'Mint' },
  { id: 'blau', label: 'Blau' },
];

// ---------- Gemalt: Striche -> SVG ----------
const NS = 'http://www.w3.org/2000/svg';

/** Weicher Pfad durch die Punkte (Mittelpunkte als Stützstellen). */
function pathData(p) {
  if (p.length <= 2) return `M${p[0]} ${p[1]}l0.1 0`; // einzelner Punkt
  let d = `M${p[0]} ${p[1]}`;
  for (let i = 2; i < p.length - 2; i += 2) {
    const mx = (p[i] + p[i + 2]) / 2;
    const my = (p[i + 1] + p[i + 3]) / 2;
    d += `Q${p[i]} ${p[i + 1]} ${mx} ${my}`;
  }
  return d + `L${p[p.length - 2]} ${p[p.length - 1]}`;
}

/** Gemalte Striche als <svg> (Farben über CSS-Klassen, keine Inline-Styles). */
export function drawingSvg(strokes, { className, label = 'gemalt' } = {}) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${PAD.w} ${PAD.h}`);
  svg.setAttribute('class', ['drawing', className].filter(Boolean).join(' '));
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', label);
  for (const s of strokes || []) {
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', pathData(s.p));
    path.setAttribute('class', `ink ink--${s.c}`);
    svg.append(path);
  }
  return svg;
}

// ---------- Eine Nachricht (Zettel mit Magnet) ----------
export function messageNote(msg, { className } = {}) {
  const from = personById(msg.fromPerson);
  return h('figure', { class: ['door-note', `door-note--${msg.paper || 'gelb'}`, className] },
    h('span', { class: 'door-note__magnet', 'data-tone': from?.tone || 1, 'aria-hidden': 'true' }),
    msg.body && h('p', { class: 'door-note__text' }, msg.body),
    msg.drawing?.length && drawingSvg(msg.drawing, { className: 'door-note__drawing', label: `gemalt von ${from?.name || 'jemandem'}` }),
    h('figcaption', { class: 'door-note__from' },
      avatar(from, { size: 'xs' }),
      h('span', {}, `${from ? `von ${from.name}` : 'für dich'} · ${formatWhen(msg.createdAt)}`),
    ),
  );
}

// ---------- Die Tür ----------
const SEEN_KEY = 'haushalt_tuer_gesehen';
let seenMemory = [];
function seenIds() {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'); } catch { return seenMemory; }
}
function markSeen(msgs) {
  const ids = [...new Set([...seenIds(), ...msgs.map((m) => m.id)])].slice(-50);
  seenMemory = ids;
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(ids)); } catch { /* egal */ }
}
const unseen = () => {
  const seen = new Set(seenIds());
  return messagesForMe().filter((m) => !seen.has(m.id));
};

let door = null;       // gerade sichtbare Tür (oder null)
let started = false;   // Start-Tür ist durch -> ab jetzt auf neue Nachrichten achten
let wasAway = false;   // App war gerade im Hintergrund
const toasted = new Set();

function buildDoor() {
  const panel = h('div', { class: 'fx-door__panel' },
    h('span', { class: 'fx-door__handle' }),
    h('div', { class: 'fx-door__content' }),
  );
  const el = h('div', { class: 'fx-door', 'aria-hidden': 'true' }, panel);
  document.body.append(el);
  return el;
}

/** Tür aufschwingen lassen und entfernen. */
function swingOpen(el) {
  if (!el?.isConnected || el.dataset.opening) return;
  el.dataset.opening = '1';
  if (door === el) door = null;
  document.removeEventListener('keydown', onKey);
  if (calm()) { el.remove(); return; }
  const panel = el.firstChild;
  const swing = panel.animate([
    { transform: 'perspective(1400px) rotateY(0deg)' },
    { transform: 'perspective(1400px) rotateY(-12deg)', offset: 0.25 },
    { transform: 'perspective(1400px) rotateY(-96deg)' },
  ], { duration: 900, delay: 100, easing: 'cubic-bezier(.55,.05,.4,1)', fill: 'both' });
  const shade = el.animate([{ opacity: 1 }, { opacity: 1, offset: 0.6 }, { opacity: 0 }], { duration: 1000, fill: 'both' });
  el.addEventListener('pointerdown', () => { swing.finish(); shade.finish(); });
  Promise.allSettled([swing.finished, shade.finished]).then(() => el.remove());
}

function onKey(e) {
  if (door && (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    openUp();
  }
}

function openUp() {
  if (!door) return;
  markSeen(messagesForMe());
  swingOpen(door);
}

/** Nachrichten auf die (geschlossene) Tür hängen; Antippen öffnet. */
function showMessages(el, msgs) {
  door = el;
  el.removeAttribute('aria-hidden');
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', 'Nachricht an der Tür');
  el.classList.add('fx-door--messages');
  const content = el.querySelector('.fx-door__content');
  const notes = msgs.map((m, i) => messageNote(m, { className: `door-note--n${i % 3}` }));
  const button = h('button', { type: 'button', class: 'fx-door__open', onclick: (e) => { e.stopPropagation(); openUp(); } },
    'Antippen zum Öffnen');
  content.replaceChildren(
    h('p', { class: 'fx-door__title' }, msgs.length > 1 ? 'Nachrichten für dich\u00a0♡' : 'Eine Nachricht für dich\u00a0♡'),
    h('div', { class: 'fx-door__notes' }, notes),
    button,
  );
  el.addEventListener('click', openUp);
  document.addEventListener('keydown', onKey);
  button.focus({ preventScroll: true });
  if (!calm()) {
    notes.forEach((n, i) => n.animate([
      { opacity: 0, transform: 'translateY(-28px) scale(1.08) rotate(-6deg)' },
      { opacity: 1, transform: 'translateY(3px) scale(0.99) rotate(1.5deg)', offset: 0.6 },
      { opacity: 1, transform: 'none' },
    ], { duration: 560, delay: 120 + i * 140, easing: 'cubic-bezier(.3,.7,.4,1)', fill: 'backwards' }));
  }
}

/** Ohne Nachricht: kurz „Hallo …“, dann von selbst auf. */
function greet(el, person) {
  const date = new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
  el.querySelector('.fx-door__content').replaceChildren(
    h('p', { class: 'fx-door__hello' }, `Hallo ${person.name}\u00a0♡`),
    h('p', { class: 'fx-door__date' }, date),
  );
  setTimeout(() => swingOpen(el), 750);
  el.addEventListener('pointerdown', () => swingOpen(el), { once: true });
}

/** Warten, bis die Daten da sind (oder die Anmeldung gebraucht wird). */
function whenLoaded(timeout) {
  return new Promise((resolve) => {
    if (state.loaded || state.needsLogin) return resolve(true);
    let off = () => {};
    const timer = setTimeout(() => { off(); resolve(false); }, timeout);
    off = subscribe(() => {
      if (!state.loaded && !state.needsLogin) return;
      clearTimeout(timer);
      queueMicrotask(off);
      resolve(true);
    });
  });
}

/** Beim Start der App aufrufen (statt der alten Tür-Animation). */
export function doorStart() {
  const el = calm() ? null : buildDoor(); // gleich zu – sonst sieht man kurz die App
  whenLoaded(3500).then((ok) => {
    const msgs = ok && !state.needsLogin && me() ? messagesForMe() : [];
    if (msgs.length) showMessages(el || buildDoor(), msgs);
    else if (el && ok && !state.needsLogin && me()) greet(el, me());
    else if (el) swingOpen(el);
    markSeenOnStart(msgs);
    started = true;
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') wasAway = true;
    else setTimeout(() => { wasAway = false; }, 8000);
  });
  subscribe(checkNew);
}

// Was beim Start schon an der Tür hing, gilt nicht mehr als „neu“ (auch wenn man nicht antippt).
function markSeenOnStart(msgs) {
  for (const m of msgs) toasted.add(m.id);
}

/** Neue Nachricht für mich da? -> Tür wieder zu (nach Rückkehr) oder kurzer Hinweis. */
function checkNew() {
  if (!started || door || state.needsLogin || !me()) return;
  const fresh = unseen().filter((m) => !toasted.has(m.id));
  if (!fresh.length) return;
  fresh.forEach((m) => toasted.add(m.id));
  if (wasAway) {
    showMessages(buildDoor(), messagesForMe());
  } else {
    const from = personById(fresh[0].fromPerson);
    showToast(`${from?.name || 'Jemand'} hat dir eine Nachricht an die Tür gehängt ♡`, {
      actionLabel: 'Ansehen',
      duration: 8000,
      onAction: () => { if (!door) showMessages(buildDoor(), messagesForMe()); },
    });
  }
}

// ---------- Malfläche (zum Malen mit dem Finger) ----------
/**
 * Öffnet die Malfläche über allem. onDone(strokes) bekommt die Striche (oder [] = nichts gemalt).
 * Liegt außerhalb der Ansichten, damit das Neuzeichnen der App beim Malen nicht stört.
 */
export function openPad(initial, onDone) {
  let strokes = (initial || []).map((s) => ({ c: s.c, p: [...s.p] }));
  let ink = strokes.at(-1)?.c || 'tinte';
  let current = null;

  const canvas = h('canvas', { class: 'pad__canvas', 'aria-label': 'Malfläche – mit dem Finger malen' });
  const inkButtons = INKS.map((i) => h('button', {
    type: 'button', class: ['pad__ink', `pad__ink--${i.id}`], 'aria-label': i.label, title: i.label,
    'aria-pressed': String(i.id === ink),
    onclick: () => { ink = i.id; inkButtons.forEach((b, j) => b.setAttribute('aria-pressed', String(INKS[j].id === ink))); },
  }));
  const close = (result) => {
    box.remove();
    document.removeEventListener('keydown', onKeyPad);
    if (result) onDone(result);
  };
  const onKeyPad = (e) => { if (e.key === 'Escape') close(null); };
  const box = h('div', { class: 'pad', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Malen' },
    h('div', { class: 'pad__sheet' },
      h('p', { class: 'pad__title' }, 'Mal etwas ♡'),
      h('div', { class: 'pad__paper' }, canvas),
      h('div', { class: 'pad__tools' },
        h('div', { class: 'pad__inks', role: 'group', 'aria-label': 'Farbe' }, inkButtons),
        h('button', { type: 'button', class: 'btn btn--small btn--ghost', onclick: () => { strokes.pop(); paint(); } }, 'Zurück'),
        h('button', { type: 'button', class: 'btn btn--small btn--ghost', onclick: () => { strokes = []; paint(); } }, 'Alles weg'),
      ),
      h('div', { class: 'add-form pad__actions' },
        h('button', { type: 'button', class: 'btn btn--primary', 'data-pad': 'done', onclick: () => close(strokes) }, 'Fertig'),
        h('button', { type: 'button', class: 'btn btn--ghost', onclick: () => close(null) }, 'Abbrechen'),
      ),
    ),
  );
  document.body.append(box);
  document.addEventListener('keydown', onKeyPad);

  // Farben aus dem CSS lesen (eine versteckte Probe je Farbe)
  const colors = {};
  for (const i of INKS) {
    const probe = h('span', { class: `ink-probe ink--${i.id}` });
    box.append(probe);
    colors[i.id] = getComputedStyle(probe).color;
    probe.remove();
  }

  const ctx = canvas.getContext('2d');
  let scale = 1;
  function fit() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    scale = canvas.width / PAD.w;
    paint();
  }
  function line(s) {
    const p = s.p;
    ctx.strokeStyle = colors[s.c];
    ctx.lineWidth = 5 * scale;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(p[0] * scale, p[1] * scale);
    if (p.length <= 2) ctx.lineTo(p[0] * scale + 0.1, p[1] * scale);
    for (let i = 2; i < p.length - 2; i += 2) {
      ctx.quadraticCurveTo(p[i] * scale, p[i + 1] * scale, ((p[i] + p[i + 2]) / 2) * scale, ((p[i + 1] + p[i + 3]) / 2) * scale);
    }
    if (p.length > 2) ctx.lineTo(p[p.length - 2] * scale, p[p.length - 1] * scale);
    ctx.stroke();
  }
  function paint() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    strokes.forEach(line);
  }
  const point = (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * PAD.w);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * PAD.h);
    return [Math.min(PAD.w, Math.max(0, x)), Math.min(PAD.h, Math.max(0, y))];
  };
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    canvas.setPointerCapture?.(e.pointerId);
    current = { c: ink, p: point(e) };
    strokes.push(current);
    paint();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!current) return;
    const [x, y] = point(e);
    const p = current.p;
    // nur weiter malen, wenn sich der Finger ein Stück bewegt hat (spart Platz)
    if (Math.hypot(x - p[p.length - 2], y - p[p.length - 1]) < 3) return;
    p.push(x, y);
    paint();
  });
  const end = () => { current = null; };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  fit();
  window.addEventListener('resize', fit, { passive: true });
  const stopResize = new MutationObserver(() => {
    if (!box.isConnected) { window.removeEventListener('resize', fit); stopResize.disconnect(); }
  });
  stopResize.observe(document.body, { childList: true });
}
