// Fotos: eure Polaroids, die zwischen den Zetteln an der Kühlschranktür hängen.
//   - "+ Foto" öffnet Kamera/Galerie, das Bild wird im Browser verkleinert
//     (max. 1600 px, JPEG) und ohne Ortsdaten hochgeladen.
//   - Antippen = groß ansehen. Im Bearbeiten-Modus: abnehmen (löschen).
import { h } from '../util.js';
import { api } from '../api.js';
import { addPhoto, deletePhoto } from '../store.js';
import { showToast } from './toast.js';
import { icon } from './art.js';

const MAX_SIZE = 1600;
const draft = { blob: null, url: null, caption: '', busy: false };

/**
 * Liefert die Polaroids einzeln (zum Verteilen zwischen den Zetteln, siehe vorrat.js)
 * und die Kachel zum Hinzufügen bzw. das Formular für ein neues Foto.
 * editMode = Fotos können abgenommen werden.
 */
export function photoTiles(state, ctx, { editMode = false } = {}) {
  const photos = (state.photos || []).map((photo, i) => polaroid(photo, i, editMode));
  const adder = draft.blob ? draftCard(ctx) : addTile(ctx, photos.length === 0);
  return { photos, adder };
}

function polaroid(photo, i, editMode) {
  return h('figure', { class: ['polaroid', i % 2 ? 'polaroid--left' : 'polaroid--right'], 'data-tone': (i % 6) + 1 },
    h('button', {
      type: 'button',
      class: 'polaroid__photo',
      'aria-label': photo.caption ? `Foto: ${photo.caption}` : 'Foto ansehen',
      onclick: () => (editMode ? remove(photo) : openLightbox(photo)),
    }, h('img', { src: api.photoUrl(photo), alt: photo.caption || '', loading: 'lazy', decoding: 'async' })),
    h('figcaption', { class: 'polaroid__caption' }, photo.caption || ''),
    editMode && h('button', {
      type: 'button', class: 'polaroid__remove', 'aria-label': 'Foto abnehmen',
      onclick: () => remove(photo),
    }, icon('kreuz', { wash: false })),
  );
}

function remove(photo) {
  if (!confirm('Dieses Foto abnehmen?')) return;
  deletePhoto(photo);
}

function addTile(ctx, empty) {
  const input = h('input', {
    type: 'file', accept: 'image/*', class: 'visually-hidden', tabindex: '-1',
    onchange: async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        draft.blob = await shrink(file);
        draft.url = URL.createObjectURL(draft.blob);
        draft.caption = '';
        ctx.rerender();
        document.querySelector('[data-focus-key="photo-caption"]')?.focus();
      } catch {
        showToast('Das Bild konnte nicht gelesen werden', { variant: 'error' });
      }
    },
  });
  return h('div', { class: 'polaroid polaroid--add' },
    h('button', {
      type: 'button', class: 'polaroid__photo', 'data-focus-key': 'photo-add',
      onclick: () => input.click(),
    }, icon('plus', { wash: false }), h('span', {}, empty ? 'Erstes Foto' : 'Foto')),
    h('span', { class: 'polaroid__caption' }, empty ? 'von euch ♡' : ''),
    input,
  );
}

function draftCard(ctx) {
  const reset = () => {
    URL.revokeObjectURL(draft.url);
    Object.assign(draft, { blob: null, url: null, caption: '', busy: false });
    ctx.rerender();
  };
  return h('form', {
    class: 'polaroid polaroid--draft',
    onsubmit: async (e) => {
      e.preventDefault();
      if (draft.busy) return;
      draft.busy = true;
      const ok = await addPhoto(draft.blob, draft.caption.trim());
      draft.busy = false;
      if (ok) reset();
    },
  },
    h('div', { class: 'polaroid__photo' }, h('img', { src: draft.url, alt: 'Vorschau' })),
    h('input', {
      class: 'polaroid__input', type: 'text', maxlength: 60, placeholder: 'Unterschrift …',
      'aria-label': 'Bildunterschrift (optional)', 'data-focus-key': 'photo-caption', autocomplete: 'off',
      enterkeyhint: 'done', value: draft.caption,
      oninput: (e) => { draft.caption = e.target.value; },
    }),
    h('div', { class: 'polaroid__actions' },
      h('button', { type: 'submit', class: 'btn btn--primary btn--small' }, 'Aufhängen'),
      h('button', { type: 'button', class: 'btn btn--ghost btn--small', onclick: reset }, 'Abbrechen'),
    ),
  );
}

/** Bild verkleinern und als JPEG neu speichern (entfernt auch GPS-Daten). */
async function shrink(file) {
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
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob'))), 'image/jpeg', 0.85));
}

/** Foto groß ansehen. Antippen oder Esc schließt. */
function openLightbox(photo) {
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
