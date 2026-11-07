// Ansicht "Pinnwand" (/#/pinnwand): wichtige Infos für euch beide.
//   - WLAN für Gäste: Netz + Passwort (verdeckt) + QR-Code (antippen = groß zum Scannen)
//   - Wichtige Nummern: in Gruppen (z. B. Notfälle, Haus & Vermieter), antippen = anrufen
//   - Verträge & Dokumente: Name, Notiz, PDFs oder Fotos von Papieren
//   - Freie Zettel: Titel, Text, optional etwas Geheimes (PIN, Code …), Dateien
// Gespeichert wird auf dem Server (server/modules/notes.js + note-files.js) – gilt für alle Geräte.
import { h, formatWhen } from '../util.js';
import { viewHeader, emptyState, loading, iconLabel } from '../ui/components.js';
import { icon } from '../ui/art.js';
import { byline } from '../ui/people.js';
import { showToast } from '../ui/toast.js';
import { shrink } from '../ui/photos.js';
import { qrSvg, wifiText } from '../ui/qr.js';
import { api } from '../api.js';
import {
  addNote, updateNote, deleteNote, restoreNote, filesOf, uploadNoteFile, deleteNoteFile,
} from '../store.js';

// Arten von Zetteln – Reihenfolge = Reihenfolge an der Pinnwand
const KINDS = [
  { id: 'wlan',     group: 'WLAN',                 label: 'WLAN',     icon: 'wlan',     tone: 4, placeholder: 'z. B. WLAN für Gäste' },
  { id: 'nummern',  group: 'Wichtige Nummern',     label: 'Nummern',  icon: 'telefon',  tone: 2, placeholder: 'z. B. Haus & Vermieter' },
  { id: 'dokument', group: 'Verträge & Dokumente', label: 'Dokument', icon: 'dokument', tone: 5, placeholder: 'z. B. Haftpflicht, Mietvertrag' },
  { id: 'zettel',   group: 'Zettel',               label: 'Zettel',   icon: 'notiz',    tone: 6, placeholder: 'z. B. Fahrradkeller' },
];
const kindOf = (id) => KINDS.find((k) => k.id === id) || KINDS[3];

const SECURITY = [
  { id: 'WPA', label: 'WPA/WPA2/WPA3' },
  { id: 'WEP', label: 'WEP (alt)' },
  { id: 'nopass', label: 'ohne Passwort' },
];
const MAX_PDF_MB = 25;
const REVEAL_MS = 20000; // so lange bleibt ein aufgedecktes Passwort sichtbar

// Zustand nur dieser Ansicht (bleibt beim Neuzeichnen erhalten)
const ui = {
  creating: null,        // Art des neuen Zettels (Formular offen) oder null
  draft: null,           // Entwurf für neu bzw. bearbeiten
  editingId: null,       // Zettel, der gerade bearbeitet wird
  reveal: new Set(),     // aufgedeckte Geheimnisse ("note-id")
  uploading: 0,          // laufende Uploads
  busy: false,
};

export default {
  id: 'pinnwand',
  label: 'Pinnwand',
  icon: 'pinnwand',

  render(state, ctx) {
    if (!state.loaded) return loading();
    const notes = state.notes || [];
    return [
      viewHeader({ id: 'title-pinnwand', title: 'Pinnwand', subtitle: 'WLAN, Nummern, Verträge & Dokumente' }),
      h('div', { class: 'pinboard' },
        newNoteCard(ctx),
        notes.length === 0 && !ui.creating && emptyState({
          symbol: 'pinnwand', title: 'Noch nichts angepinnt', text: 'Oben eine Art aussuchen und loslegen ♡',
        }),
        KINDS.map((k) => {
          const list = notes.filter((n) => n.kind === k.id);
          if (!list.length) return null;
          return h('section', { class: 'pin-group', 'aria-label': k.group },
            h('h2', { class: 'pin-group__title' }, icon(k.icon, { wash: false }), k.group),
            h('div', { class: 'cards cards--tasks pin-cards' }, list.map((n) => noteCard(n, ctx))),
          );
        }),
      ),
    ];
  },
};

// =====================================================================
// Neuer Zettel
// =====================================================================
const emptyDraft = (kind) => ({
  kind, title: '', body: '', secret: '', ssid: '', security: 'WPA',
  entries: kind === 'nummern' ? [{ name: '', number: '' }] : [],
  files: [],   // nur beim Neuanlegen: ausgesuchte Dateien, die nach dem Speichern hochgeladen werden
});

function newNoteCard(ctx) {
  if (ui.creating) {
    const k = kindOf(ui.creating);
    return h('section', { class: 'card card--note pin pin--form', 'data-tone': k.tone },
      h('div', { class: 'card__header' },
        h('span', { class: 'card__icon' }, icon(k.icon)),
        h('h2', { class: 'card__title' }, `Neu: ${k.label}`),
      ),
      noteForm(null, ctx),
    );
  }
  return h('section', { class: 'card pin-new', 'data-tone': 3 },
    h('div', { class: 'card__header' },
      h('span', { class: 'card__icon' }, icon('pinnwand')),
      h('h2', { class: 'card__title' }, 'Was möchtest du anpinnen?'),
    ),
    h('div', { class: 'pin-new__kinds' }, KINDS.map((k) => h('button', {
      type: 'button', class: 'pin-new__kind', 'data-tone': k.tone, 'data-focus-key': `new-${k.id}`,
      onclick: () => {
        ui.creating = k.id;
        ui.editingId = null;
        ui.draft = emptyDraft(k.id);
        ctx.rerender();
        focusLater('[data-focus-key="form-title"]');
      },
    }, icon(k.icon), h('span', {}, k.label)))),
  );
}

// =====================================================================
// Ein Zettel
// =====================================================================
function noteCard(note, ctx) {
  const k = kindOf(note.kind);
  if (ui.editingId === note.id) {
    return h('section', { class: 'card card--note pin pin--form', 'data-tone': k.tone },
      h('div', { class: 'card__header' },
        h('span', { class: 'card__icon' }, icon(k.icon)),
        h('h2', { class: 'card__title' }, 'Bearbeiten'),
      ),
      noteForm(note, ctx),
    );
  }
  return h('section', { class: ['card', 'card--note', 'pin', `pin--${note.kind}`], 'data-tone': k.tone },
    h('div', { class: 'card__header' },
      h('span', { class: 'card__icon' }, icon(k.icon)),
      h('h3', { class: 'card__title' }, note.title),
      h('button', {
        type: 'button', class: 'btn btn--icon btn--ghost pin__edit', 'aria-label': `${note.title} bearbeiten`, title: 'Bearbeiten',
        'data-focus-key': `edit-${note.id}`,
        onclick: () => startEdit(note, ctx),
      }, icon('stift', { wash: false })),
    ),
    note.kind === 'wlan' && wlanContent(note, ctx),
    note.kind === 'nummern' && phoneList(note),
    note.body && h('p', { class: 'pin__body' }, note.body),
    note.kind === 'zettel' && note.secret && h('div', { class: 'pin-field' },
      h('span', { class: 'pin-field__label' }, 'Geheim'),
      secretValue(note, note.secret, ctx),
    ),
    (note.kind === 'dokument' || note.kind === 'zettel') && fileList(filesOf(note)),
  );
}

// ---------- WLAN ----------
function wlanContent(note, ctx) {
  const d = note.data || {};
  const open = d.security === 'nopass';
  return [
    h('div', { class: 'pin-field' },
      h('span', { class: 'pin-field__label' }, 'Netz'),
      h('span', { class: 'pin-field__value' }, d.ssid || '–'),
      d.ssid && copyButton(d.ssid, 'Netzname'),
    ),
    h('div', { class: 'pin-field' },
      h('span', { class: 'pin-field__label' }, 'Passwort'),
      open || !note.secret
        ? h('span', { class: 'pin-field__value muted' }, open ? 'ohne Passwort' : '–')
        : secretValue(note, note.secret, ctx),
    ),
    d.ssid && h('button', {
      type: 'button', class: 'pin-qr', 'data-focus-key': `qr-${note.id}`,
      'aria-label': 'QR-Code für Gäste groß zeigen',
      onclick: () => openQr(note),
    },
      qrSvg(wifiText({ ssid: d.ssid, password: note.secret, security: d.security || 'WPA', hidden: d.hidden })),
      h('span', { class: 'pin-qr__text' }, h('strong', {}, 'QR-Code für Gäste'), 'antippen = groß zum Scannen'),
    ),
  ];
}

/** QR-Code bildschirmfüllend – Gast hält die Handykamera drauf. */
function openQr(note) {
  const d = note.data || {};
  const close = () => { box.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const box = h('div', { class: 'lightbox', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'WLAN-QR-Code', onclick: close },
    h('figure', { class: 'qr-big' },
      qrSvg(wifiText({ ssid: d.ssid, password: note.secret, security: d.security || 'WPA', hidden: d.hidden }), { label: `QR-Code für das WLAN ${d.ssid}` }),
      h('figcaption', { class: 'qr-big__caption' },
        h('strong', {}, d.ssid),
        h('span', {}, 'Handykamera draufhalten – schon seid ihr im WLAN ♡'),
      ),
    ),
  );
  document.body.append(box);
  document.addEventListener('keydown', onKey);
}

// ---------- Nummern ----------
function phoneList(note) {
  const entries = note.data?.entries || [];
  if (!entries.length) return h('p', { class: 'muted' }, 'Noch keine Nummern – über den Stift eintragen.');
  return h('ul', { class: 'phone-list' }, entries.map((e) => h('li', {},
    h('a', { class: 'phone', href: `tel:${e.number.replace(/[^\d+]/g, '')}`, 'aria-label': `${e.name || 'Nummer'} anrufen: ${e.number}` },
      h('span', { class: 'phone__text' },
        e.name && h('span', { class: 'phone__name' }, e.name),
        h('span', { class: 'phone__number' }, e.number),
      ),
      h('span', { class: 'phone__call' }, icon('telefon', { wash: false })),
    ),
  )));
}

// ---------- Dateien ----------
function fileList(files) {
  if (!files.length) return null;
  return h('ul', { class: 'file-list' }, files.map((f) => h('li', {},
    f.type === 'jpg'
      ? h('button', { type: 'button', class: 'file', onclick: () => openImage(f) }, fileInner(f))
      : h('a', { class: 'file', href: api.noteFileUrl(f), target: '_blank', rel: 'noopener' }, fileInner(f)),
  )));
}

function fileInner(f) {
  return [
    icon(f.type === 'pdf' ? 'dokument' : 'kamera', { wash: false }),
    h('span', { class: 'file__name' }, f.name),
    h('span', { class: 'file__size' }, formatSize(f.size)),
  ];
}

/** Foto eines Papiers groß ansehen (antippen schließt). */
function openImage(f) {
  const close = () => { box.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const box = h('div', { class: 'lightbox lightbox--doc', role: 'dialog', 'aria-modal': 'true', 'aria-label': f.name, onclick: close },
    h('img', { class: 'doc-image', src: api.noteFileUrl(f), alt: f.name }),
  );
  document.body.append(box);
  document.addEventListener('keydown', onKey);
}

const formatSize = (bytes) => (bytes >= 1024 * 1024
  ? `${(bytes / 1024 / 1024).toLocaleString('de-DE', { maximumFractionDigits: 1 })} MB`
  : `${Math.max(1, Math.round(bytes / 1024))} KB`);

// ---------- Geheimes: verdeckt, antippen zeigt ----------
function secretValue(note, value, ctx) {
  const key = `secret-${note.id}`;
  const shown = ui.reveal.has(key);
  return h('span', { class: 'pin-secret' },
    h('button', {
      type: 'button', class: ['secret', shown && 'is-shown'], 'data-focus-key': key,
      'aria-label': shown ? 'Wieder verdecken' : 'Antippen zum Zeigen',
      onclick: () => {
        if (shown) ui.reveal.delete(key);
        else {
          ui.reveal.add(key);
          setTimeout(() => { if (ui.reveal.delete(key)) ctx.rerender(); }, REVEAL_MS);
        }
        ctx.rerender();
      },
    },
    h('span', { class: 'secret__value' }, shown ? value : '••••••••'),
    !shown && h('span', { class: 'secret__hint' }, icon('auge', { wash: false }), 'zeigen')),
    copyButton(value, 'Passwort'),
  );
}

function copyButton(text, what) {
  return h('button', {
    type: 'button', class: 'btn btn--icon btn--ghost pin-copy', 'aria-label': `${what} kopieren`, title: 'Kopieren',
    onclick: async () => {
      if (await copyText(text)) showToast(`${what} kopiert ♡`);
      else showToast('Kopieren hat nicht geklappt', { variant: 'error' });
    },
  }, icon('kopieren', { wash: false }));
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Notlösung für ältere Browser
    const area = h('textarea', { class: 'visually-hidden', readonly: true }, text);
    document.body.append(area);
    area.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* nichts */ }
    area.remove();
    return ok;
  }
}

// =====================================================================
// Formular (neu + bearbeiten)
// =====================================================================
function startEdit(note, ctx) {
  ui.creating = null;
  ui.editingId = note.id;
  ui.draft = {
    ...emptyDraft(note.kind),
    title: note.title,
    body: note.body || '',
    secret: note.secret || '',
    ssid: note.data?.ssid || '',
    security: note.data?.security || 'WPA',
    entries: (note.data?.entries || []).map((e) => ({ name: e.name || '', number: e.number })),
  };
  if (note.kind === 'nummern' && !ui.draft.entries.length) ui.draft.entries.push({ name: '', number: '' });
  ctx.rerender();
  focusLater('[data-focus-key="form-title"]');
}

function closeForm(ctx) {
  ui.creating = null;
  ui.editingId = null;
  ui.draft = null;
  ctx.rerender();
}

function noteForm(note, ctx) {
  const d = ui.draft;
  const k = kindOf(d.kind);
  const field = (label, ...content) => h('label', { class: 'choice' }, h('span', { class: 'choice__legend' }, label), ...content);
  const input = (key, props) => h('input', {
    class: 'input', type: 'text', autocomplete: 'off', 'data-focus-key': `form-${key}`, value: d[key],
    oninput: (e) => { d[key] = e.target.value; }, ...props,
  });

  return h('form', {
    class: 'pin-form',
    onsubmit: (e) => { e.preventDefault(); save(note, ctx); },
    onkeydown: (e) => { if (e.key === 'Escape') closeForm(ctx); },
  },
    field('Überschrift', input('title', { maxlength: 80, placeholder: k.placeholder, enterkeyhint: 'next' })),

    d.kind === 'wlan' && [
      field('Netzname (SSID)', input('ssid', { maxlength: 64, placeholder: 'so heißt das WLAN', autocapitalize: 'off', spellcheck: 'false' })),
      h('fieldset', { class: 'choice' },
        h('legend', { class: 'choice__legend' }, 'Verschlüsselung'),
        h('div', { class: 'pills' }, SECURITY.map((s) => h('button', {
          type: 'button', class: ['pill', d.security === s.id && 'is-chosen'], 'aria-pressed': String(d.security === s.id),
          'data-focus-key': `form-sec-${s.id}`,
          onclick: () => { d.security = s.id; ctx.rerender(); },
        }, s.label))),
      ),
      d.security !== 'nopass' && field('Passwort (wird verdeckt angezeigt)',
        input('secret', { maxlength: 200, autocapitalize: 'off', spellcheck: 'false' })),
    ],

    d.kind === 'nummern' && h('fieldset', { class: 'choice' },
      h('legend', { class: 'choice__legend' }, 'Nummern'),
      h('ul', { class: 'phone-edit' }, d.entries.map((e, i) => h('li', { class: 'phone-edit__row' },
        h('input', {
          class: 'input', type: 'text', maxlength: 60, placeholder: 'Wer? (z. B. Hausmeister)', 'aria-label': `Name ${i + 1}`,
          autocomplete: 'off', 'data-focus-key': `form-name-${i}`, value: e.name,
          oninput: (ev) => { e.name = ev.target.value; },
        }),
        h('input', {
          class: 'input', type: 'tel', inputmode: 'tel', maxlength: 30, placeholder: 'Nummer', 'aria-label': `Nummer ${i + 1}`,
          autocomplete: 'off', 'data-focus-key': `form-number-${i}`, value: e.number,
          oninput: (ev) => { e.number = ev.target.value; },
        }),
        h('button', {
          type: 'button', class: 'btn btn--icon btn--ghost', 'aria-label': `Nummer ${i + 1} entfernen`, title: 'Entfernen',
          onclick: () => { d.entries.splice(i, 1); ctx.rerender(); },
        }, icon('kreuz', { wash: false })),
      ))),
      h('button', {
        type: 'button', class: 'btn btn--small', 'data-focus-key': 'form-add-number',
        onclick: () => {
          d.entries.push({ name: '', number: '' });
          ctx.rerender();
          focusLater(`[data-focus-key="form-name-${d.entries.length - 1}"]`);
        },
      }, iconLabel('plus', 'Nummer')),
    ),

    (d.kind === 'zettel' || d.kind === 'dokument' || d.kind === 'wlan') && field(d.kind === 'zettel' ? 'Text' : 'Notiz',
      h('textarea', {
        class: 'input input--area', rows: d.kind === 'zettel' ? 4 : 2, maxlength: 4000, 'data-focus-key': 'form-body',
        placeholder: d.kind === 'dokument' ? 'z. B. Kündigungsfrist 3 Monate, Kundennr. …' : d.kind === 'wlan' ? 'z. B. Router steht im Flur' : '',
        value: d.body, oninput: (e) => { d.body = e.target.value; },
      })),

    d.kind === 'zettel' && field('Geheim (z. B. PIN, Code) – wird verdeckt angezeigt',
      input('secret', { maxlength: 200, autocapitalize: 'off', spellcheck: 'false' })),

    (d.kind === 'zettel' || d.kind === 'dokument') && filesField(note, ctx),

    h('div', { class: 'add-form' },
      h('button', { type: 'submit', class: 'btn btn--primary', 'data-focus-key': 'form-save', disabled: ui.busy }, note ? 'Speichern' : 'Anpinnen'),
      h('button', { type: 'button', class: 'btn btn--ghost', onclick: () => closeForm(ctx) }, 'Abbrechen'),
      note && h('button', {
        type: 'button', class: 'btn btn--icon btn--danger pin-form__delete', 'aria-label': 'Zettel abnehmen', title: 'Abnehmen',
        onclick: () => remove(note, ctx),
      }, icon('muell', { wash: false })),
    ),
    note?.createdBy && h('p', { class: 'task-edit__by' }, byline(note.createdBy, `angepinnt ${formatWhen(note.createdAt)}`)),
  );
}

// ---------- Dateien im Formular ----------
function filesField(note, ctx) {
  const d = ui.draft;
  const existing = note ? filesOf(note) : [];
  const picker = h('input', {
    type: 'file', accept: 'application/pdf,image/*', multiple: true, class: 'visually-hidden', tabindex: '-1',
    onchange: async (e) => {
      const chosen = [...(e.target.files || [])];
      e.target.value = '';
      for (const file of chosen) {
        const prepared = await prepareFile(file);
        if (!prepared) continue;
        if (note) {
          ui.uploading++;
          ctx.rerender();
          const ok = await uploadNoteFile(note, prepared.blob, prepared.name);
          ui.uploading--;
          if (ok) showToast(`„${ok.name}“ angehängt`);
          ctx.rerender();
        } else {
          d.files.push(prepared);
          ctx.rerender();
        }
      }
    },
  });
  const row = (name, size, type, onRemove) => h('li', { class: 'file-edit' },
    icon(type === 'pdf' ? 'dokument' : 'kamera', { wash: false }),
    h('span', { class: 'file__name' }, name),
    h('span', { class: 'file__size' }, formatSize(size)),
    h('button', { type: 'button', class: 'btn btn--icon btn--ghost', 'aria-label': `${name} entfernen`, title: 'Entfernen', onclick: onRemove },
      icon('muell', { wash: false })),
  );
  return h('fieldset', { class: 'choice' },
    h('legend', { class: 'choice__legend' }, 'Dateien (PDF oder Foto)'),
    (existing.length > 0 || d.files.length > 0) && h('ul', { class: 'file-list file-list--edit' },
      existing.map((f) => row(f.name, f.size, f.type, () => {
        if (confirm(`„${f.name}“ wirklich löschen?`)) deleteNoteFile(f);
      })),
      d.files.map((f, i) => row(f.name, f.blob.size, f.type, () => { d.files.splice(i, 1); ctx.rerender(); })),
    ),
    h('div', { class: 'pills' },
      h('button', { type: 'button', class: 'btn btn--small', 'data-focus-key': 'form-file', onclick: () => picker.click() },
        iconLabel('klammer', 'PDF oder Foto anhängen')),
      ui.uploading > 0 && h('span', { class: 'muted' }, 'lädt hoch …'),
    ),
    picker,
  );
}

/** PDF prüfen bzw. Foto verkleinern (entfernt auch GPS-Daten). */
async function prepareFile(file) {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (isPdf) {
    if (file.size > MAX_PDF_MB * 1024 * 1024) {
      showToast(`„${file.name}“ ist zu groß (höchstens ${MAX_PDF_MB} MB)`, { variant: 'error' });
      return null;
    }
    return { blob: new Blob([await file.arrayBuffer()], { type: 'application/pdf' }), name: file.name, type: 'pdf' };
  }
  try {
    const blob = await shrink(file, { maxSize: 2400 });
    return { blob, name: file.name.replace(/\.[^.]+$/, '') + '.jpg', type: 'jpg' };
  } catch {
    showToast(`„${file.name}“ konnte nicht gelesen werden – bitte PDF oder Foto`, { variant: 'error' });
    return null;
  }
}

// ---------- Speichern / Abnehmen ----------
async function save(note, ctx) {
  const d = ui.draft;
  const title = d.title.trim();
  if (!title) {
    focusLater('[data-focus-key="form-title"]');
    showToast('Bitte eine Überschrift eintragen', { variant: 'error' });
    return;
  }
  const data = { title, body: d.body.trim() || null };
  if (d.kind === 'wlan') {
    data.data = { ssid: d.ssid.trim() || null, security: d.security };
    data.secret = d.security === 'nopass' ? null : d.secret.trim() || null;
  }
  if (d.kind === 'zettel') data.secret = d.secret.trim() || null;
  if (d.kind === 'nummern') {
    const filled = d.entries
      .map((e, i) => ({ i, name: e.name.trim(), number: e.number.trim() }))
      .filter((e) => e.name || e.number);
    const bad = filled.find((e) => !/\d/.test(e.number) || /[^\d\s+/().-]/.test(e.number));
    if (bad) {
      showToast(`Nummer ${bad.i + 1}: bitte nur Ziffern (und + - / Leerzeichen)`, { variant: 'error' });
      focusLater(`[data-focus-key="form-number-${bad.i}"]`);
      return;
    }
    data.data = { entries: filled.map(({ name, number }) => ({ name, number })) };
  }

  ui.busy = true;
  ctx.rerender();
  const saved = note ? await updateNote(note, data) : await addNote({ kind: d.kind, ...data });
  if (saved && !note) {
    // ausgesuchte Dateien jetzt hochladen
    for (const f of d.files) await uploadNoteFile(saved, f.blob, f.name);
  }
  ui.busy = false;
  if (!saved) { ctx.rerender(); return; }
  closeForm(ctx);
  showToast(note ? 'Gespeichert ♡' : `„${title}“ hängt an der Pinnwand ♡`);
}

function remove(note, ctx) {
  const files = filesOf(note);
  if (files.length) {
    const what = files.length === 1 ? 'der angehängten Datei' : `${files.length} angehängten Dateien`;
    if (!confirm(`„${note.title}“ mit ${what} abnehmen? Die Dateien werden gelöscht.`)) return;
    closeForm(ctx);
    deleteNote(note);
    showToast(`„${note.title}“ abgenommen`);
    return;
  }
  closeForm(ctx);
  deleteNote(note);
  showToast(`„${note.title}“ abgenommen`, { actionLabel: 'Rückgängig', onAction: () => restoreNote(note) });
}

function focusLater(selector) {
  requestAnimationFrame(() => document.querySelector(selector)?.focus({ preventScroll: true }));
}
