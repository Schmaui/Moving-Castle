// Ansicht "Einstellungen" (/#/einstellungen): alles an einem Ort.
// Was hier eingestellt wird, gilt für ALLE Geräte (liegt auf dem Server),
// außer "Dieses Gerät".
//
// NEUE EINSTELLUNG? 1) in server/modules/settings.js erlauben,
//                   2) hier unten einen Abschnitt (section) ergänzen.
import { h } from '../util.js';
import { viewHeader, loading, iconLabel } from '../ui/components.js';
import { icon, FIGURES } from '../ui/art.js';
import { avatar } from '../ui/people.js';
import { myId, setMyId } from '../me.js';
import { api } from '../api.js';
import { shrink, openLightbox } from '../ui/photos.js';
import { showToast } from '../ui/toast.js';
import { calendarSetup } from './kalender.js';
import {
  addPhoto, deletePhoto, updatePhoto, movePhoto, sortedPhotos, updateSettings, logout,
  updatePerson, uploadAvatar, removeAvatar,
} from '../store.js';

// Farben der Kühlschranktür (die echten Farbwerte stehen in css/tokens.css)
const FRIDGE_COLORS = [
  { id: 'mauve', label: 'Mauve' },
  { id: 'rose', label: 'Rosé' },
  { id: 'mint', label: 'Mint' },
  { id: 'salbei', label: 'Salbei' },
  { id: 'himmel', label: 'Himmel' },
  { id: 'creme', label: 'Creme' },
];

// Fotos hängen verstreut an der Tür (ui/photos.js). Gespeichert als photoEvery: 0 = aus, sonst an.
const PHOTO_EVERY = [
  { value: 2, label: 'an' },
  { value: 0, label: 'aus' },
];

const draft = { blob: null, url: null, caption: '', busy: false };
const captions = {};   // angefangene Änderungen an Bildunterschriften
const names = {};      // angefangene Änderungen an Namen
const uploading = new Set(); // Profilfotos, die gerade hochgeladen werden

export default {
  id: 'einstellungen',
  label: 'Einstellungen',
  navLabel: 'Mehr',
  icon: 'zahnrad',

  render(state, ctx) {
    if (!state.loaded) return loading();
    return [
      viewHeader({ id: 'title-einstellungen', title: 'Einstellungen', subtitle: 'gilt für euch beide ♡' }),
      h('div', { class: 'settings' },
        peopleSection(state, ctx),
        photosSection(ctx),
        calendarSection(state, ctx),
        fridgeSection(state),
        deviceSection(state, ctx),
      ),
    ];
  },
};

// ---------- Wir zwei (Profile) ----------
function peopleSection(state, ctx) {
  if (!state.people.length) return null;
  return section('Wir zwei', 'herz', 'Name, Bild und Farbe', 5,
    h('ul', { class: 'person-list' }, state.people.map((p) => personRow(p, ctx))),
  );
}

function personRow(person, ctx) {
  const saveName = () => {
    const value = (names[person.id] ?? person.name).trim();
    delete names[person.id];
    if (value && value !== person.name) updatePerson(person, { name: value });
    else ctx.rerender();
  };
  const input = h('input', {
    type: 'file', accept: 'image/*', class: 'visually-hidden', tabindex: '-1',
    onchange: async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      uploading.add(person.id);
      ctx.rerender();
      try {
        const blob = await shrink(file, { maxSize: 480, square: true });
        if (await uploadAvatar(person, blob)) showToast('Neues Profilbild ♡');
      } catch {
        showToast('Das Bild konnte nicht gelesen werden', { variant: 'error' });
      } finally {
        uploading.delete(person.id);
        ctx.rerender();
      }
    },
  });
  return h('li', { class: 'person-row' },
    h('button', {
      type: 'button', class: ['person-row__pic', uploading.has(person.id) && 'is-busy'],
      'aria-label': `Profilbild von ${person.name} ändern`, 'data-focus-key': `pic-${person.id}`,
      onclick: () => input.click(),
    }, avatar(person, { size: 'lg' }), h('span', { class: 'person-row__cam' }, icon('kamera', { wash: false }))),
    input,
    h('div', { class: 'person-row__body' },
      h('input', {
        class: 'input person-row__name', type: 'text', maxlength: 30, 'aria-label': 'Name',
        'data-focus-key': `name-${person.id}`, autocomplete: 'off', enterkeyhint: 'done',
        value: names[person.id] ?? person.name,
        oninput: (e) => { names[person.id] = e.target.value; },
        onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } },
        onblur: saveName,
      }),
      person.photo
        ? h('button', {
          type: 'button', class: 'btn btn--small btn--ghost',
          onclick: () => { if (confirm('Profilfoto entfernen? Dann siehst du wieder die gezeichnete Figur.')) removeAvatar(person); },
        }, 'Foto entfernen')
        : h('div', { class: 'figure-picker', role: 'group', 'aria-label': 'Figur aussuchen' },
          FIGURES.map((f) => h('button', {
            type: 'button',
            class: ['figure-picker__item', f.name === person.figure && 'is-chosen'],
            'data-tone': person.tone,
            'aria-pressed': String(f.name === person.figure),
            'aria-label': f.label, title: f.label,
            'data-focus-key': `fig-${person.id}-${f.name}`,
            onclick: () => updatePerson(person, { figure: f.name }),
          }, icon(f.name)))),
      h('div', { class: 'tone-picker', role: 'group', 'aria-label': 'Farbe aussuchen' },
        [1, 2, 3, 4, 5, 6].map((tone) => h('button', {
          type: 'button',
          class: ['tone-picker__item', tone === person.tone && 'is-chosen'],
          'data-tone': tone,
          'aria-pressed': String(tone === person.tone),
          'aria-label': `Farbe ${tone}`,
          'data-focus-key': `tone-${person.id}-${tone}`,
          onclick: () => updatePerson(person, { tone }),
        }))),
    ),
  );
}

// ---------- Fotos ----------
function photosSection(ctx) {
  const photos = sortedPhotos();
  return section('Unsere Fotos', 'kamera', 'hängen zwischen den Zetteln im Vorrat', 1,
    photos.length === 0 && !draft.blob && h('p', { class: 'muted' }, 'Noch keine Fotos – häng das erste auf!'),
    h('ul', { class: 'photo-list' }, photos.map((photo, i) => photoRow(photo, i, photos.length))),
    draft.blob ? draftForm(ctx) : addButton(ctx),
  );
}

function photoRow(photo, i, count) {
  const key = `cap-${photo.id}`;
  const save = () => {
    const value = (captions[photo.id] ?? photo.caption ?? '').trim();
    delete captions[photo.id];
    if (value !== (photo.caption || '')) updatePhoto(photo, { caption: value || null });
  };
  return h('li', { class: 'photo-row' },
    h('button', {
      type: 'button', class: 'photo-row__thumb', 'aria-label': 'Foto groß ansehen',
      onclick: () => openLightbox(photo),
    }, h('img', { src: api.photoUrl(photo), alt: '', loading: 'lazy' })),
    h('input', {
      class: 'input photo-row__caption', type: 'text', maxlength: 60, placeholder: 'Unterschrift …',
      'aria-label': 'Bildunterschrift', 'data-focus-key': key, autocomplete: 'off', enterkeyhint: 'done',
      value: captions[photo.id] ?? photo.caption ?? '',
      oninput: (e) => { captions[photo.id] = e.target.value; },
      onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } },
      onblur: save,
    }),
    h('div', { class: 'photo-row__actions' },
      h('button', {
        type: 'button', class: 'btn btn--icon btn--ghost', 'aria-label': 'Nach vorn', title: 'Nach vorn',
        disabled: i === 0, 'data-focus-key': `up-${photo.id}`, onclick: () => movePhoto(photo, -1),
      }, icon('hoch', { wash: false })),
      h('button', {
        type: 'button', class: 'btn btn--icon btn--ghost', 'aria-label': 'Nach hinten', title: 'Nach hinten',
        disabled: i === count - 1, 'data-focus-key': `down-${photo.id}`, onclick: () => movePhoto(photo, 1),
      }, icon('runter', { wash: false })),
      h('button', {
        type: 'button', class: 'btn btn--icon btn--danger', 'aria-label': 'Foto abnehmen', title: 'Abnehmen',
        onclick: () => { if (confirm('Dieses Foto abnehmen?')) deletePhoto(photo); },
      }, icon('muell', { wash: false })),
    ),
  );
}

function addButton(ctx) {
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
        document.querySelector('[data-focus-key="new-photo-caption"]')?.focus();
      } catch {
        showToast('Das Bild konnte nicht gelesen werden', { variant: 'error' });
      }
    },
  });
  return h('div', { class: 'add-form' },
    h('button', { type: 'button', class: 'btn btn--primary', 'data-focus-key': 'photo-add', onclick: () => input.click() },
      iconLabel('plus', 'Foto hinzufügen')),
    input,
  );
}

function draftForm(ctx) {
  const reset = () => {
    URL.revokeObjectURL(draft.url);
    Object.assign(draft, { blob: null, url: null, caption: '', busy: false });
    ctx.rerender();
  };
  return h('form', {
    class: 'photo-draft',
    onsubmit: async (e) => {
      e.preventDefault();
      if (draft.busy) return;
      draft.busy = true;
      const ok = await addPhoto(draft.blob, draft.caption.trim());
      draft.busy = false;
      if (ok) { reset(); showToast('Foto hängt am Kühlschrank ♡'); }
    },
  },
    h('figure', { class: 'polaroid polaroid--draft' },
      h('div', { class: 'polaroid__photo' }, h('img', { src: draft.url, alt: 'Vorschau' })),
      h('input', {
        class: 'polaroid__input', type: 'text', maxlength: 60, placeholder: 'Unterschrift …',
        'aria-label': 'Bildunterschrift (optional)', 'data-focus-key': 'new-photo-caption', autocomplete: 'off',
        enterkeyhint: 'done', value: draft.caption,
        oninput: (e) => { draft.caption = e.target.value; },
      }),
    ),
    h('div', { class: 'add-form' },
      h('button', { type: 'submit', class: 'btn btn--primary' }, 'Aufhängen'),
      h('button', { type: 'button', class: 'btn btn--ghost', onclick: reset }, 'Abbrechen'),
    ),
  );
}

// ---------- Kalender (Apple, nur lesen) ----------
function calendarSection(state, ctx) {
  return h('div', { class: 'settings__calendar' }, calendarSetup(state, ctx, { withSteps: !state.calendar?.connected, scope: 'set' }));
}

// ---------- Kühlschrank ----------
function fridgeSection(state) {
  const color = state.settings?.fridgeColor || 'mauve';
  const every = state.settings?.photoEvery ?? 2;
  return section('Kühlschrank', 'milch', 'Aussehen der Tür', 3,
    h('fieldset', { class: 'choice' },
      h('legend', { class: 'choice__legend' }, 'Farbe der Tür'),
      h('div', { class: 'swatches' }, FRIDGE_COLORS.map((c) => h('button', {
        type: 'button',
        class: ['swatch', c.id === color && 'is-chosen'],
        'data-fridge-swatch': c.id,
        'aria-pressed': String(c.id === color),
        'data-focus-key': `color-${c.id}`,
        onclick: () => updateSettings({ fridgeColor: c.id }),
      }, h('span', { class: 'swatch__dot' }), h('span', { class: 'swatch__label' }, c.label)))),
    ),
    h('fieldset', { class: 'choice' },
      h('legend', { class: 'choice__legend' }, 'Fotos an der Tür'),
      h('div', { class: 'segmented' }, PHOTO_EVERY.map((o) => h('button', {
        type: 'button',
        class: ['segmented__item', (o.value > 0) === (every > 0) && 'is-chosen'],
        'aria-pressed': String((o.value > 0) === (every > 0)),
        'data-focus-key': `every-${o.value}`,
        onclick: () => updateSettings({ photoEvery: o.value }),
      }, o.label))),
    ),
  );
}

// ---------- Dieses Gerät ----------
function deviceSection(state, ctx) {
  const mine = myId();
  return section('Dieses Gerät', 'tuer', 'gilt nur für dieses Handy/diesen Computer', 4,
    state.people.length > 0 && h('fieldset', { class: 'choice' },
      h('legend', { class: 'choice__legend' }, 'Hier bin ich:'),
      h('div', { class: 'pills' }, state.people.map((p) => h('button', {
        type: 'button',
        class: ['pill', 'pill--person', p.id === mine && 'is-chosen'],
        'aria-pressed': String(p.id === mine),
        'data-focus-key': `me-${p.id}`,
        onclick: () => { setMyId(p.id); ctx.rerender(); },
      }, avatar(p, { size: 'sm' }), p.name))),
    ),
    state.authEnabled && h('div', { class: 'choice' },
      h('button', {
        type: 'button', class: 'btn',
        onclick: () => { if (confirm('Dieses Gerät wirklich abmelden?')) logout(); },
      }, iconLabel('tuer', 'Abmelden')),
    ),
  );
}

// ---------- Baustein: ein Zettel mit Überschrift ----------
function section(title, iconName, subtitle, tone, ...content) {
  return h('section', { class: 'card settings__card', 'data-tone': tone },
    h('div', { class: 'card__header' },
      h('span', { class: 'card__icon' }, icon(iconName)),
      h('div', {},
        h('h2', { class: 'card__title' }, title),
        subtitle && h('p', { class: 'settings__sub' }, subtitle),
      ),
    ),
    ...content,
  );
}
