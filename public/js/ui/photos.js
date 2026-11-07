// Fotos: eure Polaroids, die zwischen den Zetteln an der Kühlschranktür hängen.
//   - Im Vorrat werden sie nur angezeigt (antippen = groß ansehen).
//   - Hinzufügen, Unterschrift, Reihenfolge, Abnehmen: in den Einstellungen
//     (js/views/einstellungen.js) – gilt für alle Geräte.
import { h } from '../util.js';
import { api } from '../api.js';
import { sortedPhotos } from '../store.js';
import { icon } from './art.js';

const MAX_SIZE = 1600;

/** Alle Polaroids in Reihenfolge, fertig zum Verteilen zwischen den Zetteln. */
export function photoTiles() {
  return sortedPhotos().map((photo, i) => polaroid(photo, i));
}

/** Ein Polaroid (Anzeige). */
export function polaroid(photo, i = 0, { className } = {}) {
  return h('figure', {
    class: ['polaroid', i % 2 ? 'polaroid--left' : 'polaroid--right', className],
    'data-tone': (i % 6) + 1,
  },
    h('button', {
      type: 'button',
      class: 'polaroid__photo',
      'aria-label': photo.caption ? `Foto groß ansehen: ${photo.caption}` : 'Foto groß ansehen',
      onclick: () => openLightbox(photo),
    }, h('img', { src: api.photoUrl(photo), alt: photo.caption || '', loading: 'lazy', decoding: 'async' })),
    h('figcaption', { class: 'polaroid__caption' }, photo.caption || ''),
  );
}

/** Platzhalter im Vorrat, solange es noch keine Fotos gibt -> führt zu den Einstellungen. */
export function photoHint() {
  return h('a', { class: 'polaroid polaroid--add polaroid--right', href: '#/einstellungen' },
    h('span', { class: 'polaroid__photo' }, icon('kamera', { wash: false }), h('span', {}, 'Fotos')),
    h('span', { class: 'polaroid__caption' }, 'in den Einstellungen ♡'),
  );
}

/** Bild verkleinern und als JPEG neu speichern (entfernt auch GPS-Daten). */
export async function shrink(file) {
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
  const w = source.width, hgt = source.height;
  const scale = Math.min(1, MAX_SIZE / Math.max(w, hgt));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(hgt * scale);
  canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
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
