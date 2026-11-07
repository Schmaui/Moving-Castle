// Fotos: eure Polaroids, die wie Magnete verstreut an der Kühlschranktür hängen.
//   - Im Vorrat werden sie nur angezeigt (antippen = wackelt kurz, dann groß ansehen).
//   - Verteilung: scatterPhotos() (von app.js nach jedem Zeichnen aufgerufen) klebt jedes Foto
//     an eine Kante/Ecke eines Zettels – aber nie über Artikel, Knöpfe oder Titel.
//   - Hinzufügen, Unterschrift, Reihenfolge, Abnehmen: in den Einstellungen
//     (js/views/einstellungen.js) – gilt für alle Geräte.
import { h } from '../util.js';
import { api } from '../api.js';
import { sortedPhotos, personById } from '../store.js';
import { avatar } from './people.js';
import { icon } from './art.js';
import { enter, wiggle } from './fx.js';

const MAX_SIZE = 1600;

/** Alle Polaroids in Reihenfolge, fertig zum Verteilen zwischen den Zetteln. */
export function photoTiles() {
  return sortedPhotos().map((photo, i) => polaroid(photo, i));
}

/** Ebene über den Zetteln, auf der die Fotos verstreut hängen (Position: scatterPhotos). */
export function photoLayer(photos) {
  return h('div', { class: 'photo-layer' }, photos.map((photo, i) => polaroid(photo, i, { className: 'polaroid--magnet' })));
}

// ---------- Verstreuen ----------
// Kleiner Zufall, der für dasselbe Foto immer gleich ist (damit nichts herumspringt).
function seeded(seed) {
  let x = (seed * 2654435761) >>> 0;
  return () => {
    x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
    return x / 4294967296;
  };
}
const overlaps = (a, b, pad = 0) =>
  a.left < b.right + pad && a.right > b.left - pad && a.top < b.bottom + pad && a.bottom > b.top - pad;

// Was nie verdeckt werden darf: Artikel, Knöpfe, Titel, Zähler, Eingabefelder
const PROTECTED = '.chip, .btn, .badge, .card__title, .card__icon, input, select, textarea, a, button:not(.polaroid__photo), .check-row, .task, .kitchen-tabs, .view-header';

/**
 * Klebt jedes Foto an eine Zettelkante (gemessen nach dem Zeichnen).
 * Tastet rechte Kante, linke Kante und Unterkante eines Zettels in kleinen Schritten ab
 * (Reihenfolge je Foto zufällig, aber fest) und nimmt die erste Stelle, an der nichts
 * Wichtiges verdeckt wird. Fotos verteilen sich gleichmäßig über alle Zettel.
 * Klappt nirgends etwas: Foto hängt unten an die Tür.
 */
let lastLayout = { sig: '', spots: new Map(), pad: 0 };

export function scatterPhotos(root = document) {
  for (const board of root.querySelectorAll('.fridge-board')) {
    const layer = board.querySelector(':scope > .photo-layer');
    const photos = layer ? [...layer.children] : [];
    if (!photos.length || !board.getClientRects().length) continue;
    const base = board.getBoundingClientRect();
    const rel = (r) => ({ left: r.left - base.left, top: r.top - base.top, right: r.right - base.left, bottom: r.bottom - base.top });
    const cards = [...board.querySelectorAll(':scope > .cards > .card')].map((c) => rel(c.getBoundingClientRect()));
    if (!cards.length) continue;
    const w = photos[0].offsetWidth;
    const hgt = photos[0].offsetHeight;
    const width = base.width;

    // Gleiches Bild wie beim letzten Mal? Dann gleiche Plätze (spart Rechnen, nichts springt)
    const blocked = [...board.querySelectorAll(`:scope > .cards ${PROTECTED.split(', ').join(', :scope > .cards ')}`)]
      .map((el) => rel(el.getBoundingClientRect())).filter((r) => r.right > r.left);
    const sig = [Math.round(width), w, hgt, photos.map((p) => p.dataset.photo).join(','),
      cards.map((c) => `${Math.round(c.left)},${Math.round(c.top)},${Math.round(c.bottom)}`).join(';'),
      blocked.map((b) => `${Math.round(b.left)},${Math.round(b.top)},${Math.round(b.right)}`).join(';')].join('|');
    if (sig !== lastLayout.sig) {
      const height = base.height;
      const placed = [];
      const spots = new Map();
      const free = (r) => !blocked.some((b) => overlaps(r, b, 9)) && !placed.some((p) => overlaps(r, p, 8));
      const rect = (x, y) => {
        const cx = Math.max(-10, Math.min(width - w + 10, x));
        const cy = Math.max(-10, Math.min(height - hgt, y));
        return { left: cx, top: cy, right: cx + w, bottom: cy + hgt };
      };

      photos.forEach((el, i) => {
        const rnd = seeded(Number(el.dataset.photo) || i + 1);
        const start = Math.min(cards.length - 1, Math.floor(((i + rnd() * 0.9) * cards.length) / photos.length));
        let spot = null;
        for (let k = 0; k < cards.length && !spot; k++) {
          const c = cards[(start + k) % cards.length];
          const ys = [];
          for (let y = c.top - hgt * 0.35; y <= c.bottom - hgt * 0.4; y += 14) ys.push(y);
          const xs = [];
          for (let x = c.left - w * 0.3; x <= c.right - w * 0.7; x += 18) xs.push(x);
          const lines = [
            ys.map((y) => rect(c.right - w * 0.6, y)),   // rechte Kante
            ys.map((y) => rect(c.left - w * 0.4, y)),    // linke Kante
            xs.map((x) => rect(x, c.bottom - hgt * 0.4)), // Unterkante
          ];
          // Seiten in fester Zufallsreihenfolge, auf jeder Seite ab einer zufälligen Stelle
          for (let j = lines.length - 1; j > 0; j--) { const r = Math.floor(rnd() * (j + 1)); [lines[j], lines[r]] = [lines[r], lines[j]]; }
          for (const line of lines) {
            if (!line.length) continue;
            const offset = Math.floor(rnd() * line.length);
            for (let n = 0; n < line.length && !spot; n++) {
              const r = line[(offset + n) % line.length];
              if (free(r)) spot = r;
            }
            if (spot) break;
          }
        }
        if (!spot) {
          // 2. Versuch: irgendeine freie Lücke auf der ganzen Tür (z. B. unter einer kürzeren Spalte)
          const gaps = [];
          for (let y = 0; y <= height - hgt; y += 20) {
            for (let x = -10; x <= width - w + 10; x += 20) {
              const r = rect(x, y);
              if (free(r)) gaps.push(r);
            }
          }
          if (gaps.length) spot = gaps[Math.floor(rnd() * gaps.length)];
        }
        if (!spot) {
          const y = Math.max(height, ...placed.map((p) => p.bottom)) + 14;
          spot = rect(i % 2 ? width - w - 10 : 10, y);
          spot = { ...spot, top: y, bottom: y + hgt };
        }
        placed.push(spot);
        spots.set(el.dataset.photo, { ...spot, tilt: (rnd() * 16 - 8).toFixed(1) });
      });
      const pad = Math.max(0, ...placed.map((p) => p.bottom)) - height;
      lastLayout = { sig, spots, pad: pad > 0 ? pad + 16 : 0 };
    }
    for (const el of photos) {
      const spot = lastLayout.spots.get(el.dataset.photo);
      if (!spot) continue;
      el.style.left = `${spot.left}px`;
      el.style.top = `${spot.top}px`;
      el.style.rotate = `${spot.tilt}deg`;
    }
    board.style.paddingBottom = lastLayout.pad ? `${lastLayout.pad}px` : '';
  }
}

/** Ein Polaroid (Anzeige). */
export function polaroid(photo, i = 0, { className } = {}) {
  return h('figure', {
    class: ['polaroid', i % 2 ? 'polaroid--left' : 'polaroid--right', className],
    'data-tone': (i % 6) + 1,
    'data-photo': photo.id,
    ...enter(`photo-${photo.id}${className ? `-${className}` : ''}`, photo.createdAt),
  },
    h('button', {
      type: 'button',
      class: 'polaroid__photo',
      'aria-label': photo.caption ? `Foto groß ansehen: ${photo.caption}` : 'Foto groß ansehen',
      onclick: (e) => wiggle(e.currentTarget.closest('.polaroid')).then(() => openLightbox(photo)),
    }, h('img', { src: api.photoUrl(photo), alt: photo.caption || '', loading: 'lazy', decoding: 'async' })),
    h('figcaption', { class: 'polaroid__caption' }, photo.caption || ''),
    // kleiner Sticker: wer hat's aufgehängt
    avatar(personById(photo.addedBy), { size: 'xs', className: 'polaroid__by' }),
  );
}

/** Platzhalter im Vorrat, solange es noch keine Fotos gibt -> führt zu den Einstellungen. */
export function photoHint() {
  return h('a', { class: 'polaroid polaroid--add polaroid--right', href: '#/einstellungen' },
    h('span', { class: 'polaroid__photo' }, icon('kamera', { wash: false }), h('span', {}, 'Fotos')),
    h('span', { class: 'polaroid__caption' }, 'in den Einstellungen ♡'),
  );
}

/**
 * Bild verkleinern und als JPEG neu speichern (entfernt auch GPS-Daten).
 *   shrink(file)                                -> Foto für die Tür
 *   shrink(file, { maxSize: 480, square: true }) -> quadratisch (Profilbild)
 */
export async function shrink(file, { maxSize = MAX_SIZE, square = false } = {}) {
  let source;
  try {
    source = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    source = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }
  // Ausschnitt: ganzes Bild, oder bei square die Mitte als Quadrat
  let sx = 0, sy = 0, sw = source.width, sh = source.height;
  if (square) {
    const side = Math.min(sw, sh);
    sx = (sw - side) / 2; sy = (sh - side) / 2; sw = sh = side;
  }
  const scale = Math.min(1, maxSize / Math.max(sw, sh));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(sw * scale);
  canvas.height = Math.round(sh * scale);
  canvas.getContext('2d').drawImage(source, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  source.close?.();

  // Manche Handy-Browser liefern bei toBlob leere oder falsche Daten (z. B. PNG).
  // Darum prüfen wir die ersten Bytes und nehmen notfalls den Umweg über toDataURL.
  let bytes = null;
  try {
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    if (blob) bytes = new Uint8Array(await blob.arrayBuffer());
  } catch { /* Umweg unten */ }
  if (!isJpeg(bytes)) {
    const url = canvas.toDataURL('image/jpeg', 0.85);
    const bin = atob(url.slice(url.indexOf(',') + 1));
    bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  }
  canvas.width = canvas.height = 0; // Speicher sofort freigeben (wichtig auf dem iPhone)
  if (!isJpeg(bytes)) throw new Error('kein JPEG');
  return new Blob([bytes], { type: 'image/jpeg' });
}

function isJpeg(b) {
  return !!b && b.length > 100 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
}

/** Foto groß ansehen. Antippen oder Esc schließt. */
export function openLightbox(photo) {
  const close = () => { box.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const box = h('div', { class: 'lightbox', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Foto', onclick: close },
    h('figure', { class: 'polaroid polaroid--big' },
      h('div', { class: 'polaroid__photo' }, h('img', { src: api.photoUrl(photo), alt: photo.caption || '' })),
      h('figcaption', { class: 'polaroid__caption' }, photo.caption || ''),
    ),
  );
  document.body.append(box);
  document.addEventListener('keydown', onKey);
}
