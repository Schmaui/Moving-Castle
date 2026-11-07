// Ansicht "Pinnwand" (/#/pinnwand): wichtige Infos für euch beide.
//
//   #/pinnwand                 Übersicht: Kacheln WLAN, Nummern, Notizen, Ordner, Filmabend
//   #/pinnwand/wlan            Korkbrett mit WLAN-Zetteln (Passwort verdeckt, QR-Code für Gäste)
//   #/pinnwand/nummern         Korkbrett mit Nummern-Zetteln (Gruppen, antippen = anrufen)
//   #/pinnwand/notizen         Korkbrett mit freien Notizen (optional etwas Geheimes, z. B. PIN)
//   #/pinnwand/ordner          Ordner: Unterordner + Suche über alle Dateien
//   #/pinnwand/ordner/:id      Ein Unterordner: Dateien (PDF/Foto) mit Name + Notiz
//   #/pinnwand/filmabend       Merkliste für Filme & Serien im Kino-Look (eigene Datei: filmabend.js)
//
// Gespeichert wird auf dem Server (server/modules/notes.js, folders.js, docs.js, movies.js) – gilt für alle Geräte.
import { h, formatWhen, plural } from '../util.js';
import { viewHeader, emptyState, loading, iconLabel } from '../ui/components.js';
import { icon } from '../ui/art.js';
import { byline } from '../ui/people.js';
import { showToast } from '../ui/toast.js';
import { shrink } from '../ui/photos.js';
import { qrSvg, wifiText } from '../ui/qr.js';
import { api } from '../api.js';
import { filmabendPage, filmTile } from './filmabend.js';
import { enter } from '../ui/fx.js';
import {
  addNote, updateNote, deleteNote, restoreNote,
  folderById, docsIn, addFolder, updateFolder, deleteFolder, uploadDoc, updateDoc, deleteDoc,
} from '../store.js';

// Bereiche der Pinnwand (Kacheln). kind = Art der Zettel auf diesem Korkbrett.
const BOARDS = [
  { id: 'wlan',    kind: 'wlan',    title: 'WLAN',    icon: 'wlan',    tone: 4, newLabel: 'Neues WLAN',        placeholder: 'z. B. WLAN für Gäste' },
  { id: 'nummern', kind: 'nummern', title: 'Nummern', icon: 'telefon', tone: 2, newLabel: 'Neue Nummern-Gruppe', placeholder: 'z. B. Haus & Vermieter' },
  { id: 'notizen', kind: 'zettel',  title: 'Notizen', icon: 'notiz',   tone: 6, newLabel: 'Neue Notiz',        placeholder: 'z. B. Fahrradkeller' },
];
const boardOfKind = (kind) => BOARDS.find((b) => b.kind === kind) || BOARDS[2];

const SECURITY = [
  { id: 'WPA', label: 'WPA/WPA2/WPA3' },
  { id: 'WEP', label: 'WEP (alt)' },
  { id: 'nopass', label: 'ohne Passwort' },
];
const MAX_PDF_MB = 25;
const REVEAL_MS = 20000; // so lange bleibt ein aufgedecktes Passwort sichtbar

const subroute = () => location.hash.replace(/^#\/?/, '').split(/[/?]/).slice(1);

// Zustand nur dieser Ansicht (bleibt beim Neuzeichnen erhalten)
const ui = {
  creating: null,        // Art des neuen Zettels (Formular offen) oder null
  draft: null,           // Entwurf für neuen bzw. bearbeiteten Zettel
  editingId: null,       // Zettel, der gerade bearbeitet wird
  reveal: new Set(),     // aufgedeckte Geheimnisse
  busy: false,
  // Ordner
  search: '',
  newFolder: null,       // Name des neuen Ordners (Formular offen) oder null
  folderEdit: null,      // { id, name } beim Umbenennen
  pending: [],           // ausgesuchte Dateien vor dem Hochladen: { blob, name, type, note }
  pendingFolder: null,   // zu welchem Ordner die Auswahl gehört
  docEdit: null,         // { id, name, note, folderId } beim Bearbeiten einer Datei
  uploading: false,
};

export default {
  id: 'pinnwand',
  label: 'Pinnwand',
  icon: 'pinnwand',

  render(state, ctx) {
    if (!state.loaded) return loading();
    const [section, sub] = subroute();
    if (section === 'ordner' && sub) {
      const folder = folderById(sub);
      return folder ? folderPage(folder, state, ctx) : notFound('Diesen Ordner gibt es nicht (mehr).', 'ordner');
    }
    if (section === 'ordner') return foldersPage(state, ctx);
    if (section === 'filmabend') return filmabendPage(state, ctx, backLink('#/pinnwand', 'Pinnwand'));
    const board = BOARDS.find((b) => b.id === section);
    if (board) return boardPage(board, state, ctx);
    return overview(state);
  },
};

// =====================================================================
// Übersicht: Kacheln
// =====================================================================
function overview(state) {
  const notes = state.notes || [];
  const count = (kind) => notes.filter((n) => n.kind === kind).length;
  const wlan = notes.find((n) => n.kind === 'wlan');
  const numbers = notes.filter((n) => n.kind === 'nummern').reduce((sum, n) => sum + (n.data?.entries?.length || 0), 0);
  const docs = state.docs || [];
  const tiles = [
    { ...BOARDS[0], info: count('wlan') ? (wlan.data?.ssid || wlan.title) : 'noch leer', meta: count('wlan') > 1 ? plural(count('wlan'), 'Zettel', 'Zettel') : (count('wlan') ? 'QR-Code für Gäste' : '') },
    { ...BOARDS[1], info: plural(count('nummern'), 'Gruppe', 'Gruppen'), meta: plural(numbers, 'Nummer', 'Nummern') },
    { ...BOARDS[2], info: count('zettel') ? plural(count('zettel'), 'Notiz', 'Notizen') : 'noch leer', meta: '' },
    { id: 'ordner', title: 'Ordner', icon: 'ordner', tone: 5, info: plural(docs.length, 'Datei', 'Dateien'), meta: plural((state.folders || []).length, 'Ordner', 'Ordner') },
    filmTile(state),
  ];
  return [
    viewHeader({ id: 'title-pinnwand', title: 'Pinnwand', subtitle: 'WLAN, Nummern, Notizen, Ordner & Filmabend' }),
    h('nav', { class: 'pin-tiles', 'aria-label': 'Bereiche der Pinnwand' }, tiles.map((t) => h('a', {
      class: ['card', 'pin-tile', `pin-tile--${t.id}`], 'data-tone': t.tone, href: `#/pinnwand/${t.id}`,
    },
      h('span', { class: 'pin-tile__icon' }, icon(t.icon)),
      h('span', { class: 'pin-tile__title' }, t.title),
      h('span', { class: 'pin-tile__info' }, t.info),
      t.meta && h('span', { class: 'pin-tile__meta' }, t.meta),
    ))),
  ];
}

function backLink(href, text) {
  return h('a', { class: 'back-link', href }, icon('zurueck', { wash: false }), text);
}

function notFound(text, section) {
  return [
    backLink(`#/pinnwand${section ? `/${section}` : ''}`, 'zurück'),
    emptyState({ symbol: 'ordner', title: 'Nicht gefunden', text }),
  ];
}

// =====================================================================
// Korkbrett (WLAN, Nummern, Notizen)
// =====================================================================
function boardPage(board, state, ctx) {
  const notes = (state.notes || []).filter((n) => n.kind === board.kind);
  const creating = ui.creating === board.kind;
  return [
    backLink('#/pinnwand', 'Pinnwand'),
    viewHeader({
      id: 'title-pinnwand', title: board.title,
      subtitle: board.kind === 'wlan' ? 'Antippen zeigt Passwort & QR-Code' : board.kind === 'nummern' ? 'Antippen = anrufen' : 'Freie Zettel für alles Mögliche',
      actions: [!creating && h('button', {
        type: 'button', class: 'btn btn--primary', 'data-focus-key': 'board-new',
        onclick: () => startCreate(board, ctx),
      }, iconLabel('plus', board.newLabel))],
    }),
    h('div', { class: 'corkboard' },
      h('div', { class: 'cards cards--tasks pin-cards' },
        creating && h('section', { class: 'card card--note pin pin--form', 'data-tone': board.tone },
          h('div', { class: 'card__header' },
            h('span', { class: 'card__icon' }, icon(board.icon)),
            h('h2', { class: 'card__title' }, board.newLabel),
          ),
          noteForm(null, ctx),
        ),
        notes.map((n) => noteCard(n, ctx)),
      ),
      notes.length === 0 && !creating && h('p', { class: 'corkboard__empty' }, 'Hier hängt noch nichts – oben „', board.newLabel, '“ antippen.'),
    ),
  ];
}

function startCreate(board, ctx) {
  ui.creating = board.kind;
  ui.editingId = null;
  ui.draft = emptyDraft(board.kind);
  ctx.rerender();
  focusLater('[data-focus-key="form-title"]');
}

const emptyDraft = (kind) => ({
  kind, title: '', body: '', secret: '', ssid: '', security: 'WPA',
  entries: kind === 'nummern' ? [{ name: '', number: '' }] : [],
});

// ---------- Ein Zettel ----------
function noteCard(note, ctx) {
  const b = boardOfKind(note.kind);
  if (ui.editingId === note.id) {
    return h('section', { class: 'card card--note pin pin--form', 'data-tone': b.tone },
      h('div', { class: 'card__header' },
        h('span', { class: 'card__icon' }, icon(b.icon)),
        h('h2', { class: 'card__title' }, 'Bearbeiten'),
      ),
      noteForm(note, ctx),
    );
  }
  return h('section', { class: ['card', 'card--note', 'pin', `pin--${note.kind}`], 'data-tone': b.tone, ...enter(`note-${note.id}`, note.createdAt) },
    h('div', { class: 'card__header' },
      h('span', { class: 'card__icon' }, icon(b.icon)),
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
  overlay('WLAN-QR-Code', h('figure', { class: 'qr-big' },
    qrSvg(wifiText({ ssid: d.ssid, password: note.secret, security: d.security || 'WPA', hidden: d.hidden }), { label: `QR-Code für das WLAN ${d.ssid}` }),
    h('figcaption', { class: 'qr-big__caption' },
      h('strong', {}, d.ssid),
      h('span', {}, 'Handykamera draufhalten – schon seid ihr im WLAN ♡'),
    ),
  ));
}

/** Großansicht über allem. Antippen oder Esc schließt. */
function overlay(label, content, className) {
  const close = () => { box.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const box = h('div', { class: ['lightbox', className], role: 'dialog', 'aria-modal': 'true', 'aria-label': label, onclick: close }, content);
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

// ---------- Formular (neu + bearbeiten) ----------
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
  const b = boardOfKind(d.kind);
  const field = (label, ...content) => h('label', { class: 'choice' }, h('span', { class: 'choice__legend' }, label), ...content);
  const input = (key, props) => h('input', {
    class: 'input', type: 'text', autocomplete: 'off', 'data-focus-key': `form-${key}`, value: d[key],
    oninput: (e) => { d[key] = e.target.value; }, ...props,
  });

  return h('form', {
    class: 'pin-form',
    onsubmit: (e) => { e.preventDefault(); saveNote(note, ctx); },
    onkeydown: (e) => { if (e.key === 'Escape') closeForm(ctx); },
  },
    field('Überschrift', input('title', { maxlength: 80, placeholder: b.placeholder, enterkeyhint: 'next' })),

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

    (d.kind === 'zettel' || d.kind === 'wlan') && field(d.kind === 'zettel' ? 'Text' : 'Notiz',
      h('textarea', {
        class: 'input input--area', rows: d.kind === 'zettel' ? 4 : 2, maxlength: 4000, 'data-focus-key': 'form-body',
        placeholder: d.kind === 'wlan' ? 'z. B. Router steht im Flur' : '',
        value: d.body, oninput: (e) => { d.body = e.target.value; },
      })),

    d.kind === 'zettel' && field('Geheim (z. B. PIN, Code) – wird verdeckt angezeigt',
      input('secret', { maxlength: 200, autocapitalize: 'off', spellcheck: 'false' })),

    h('div', { class: 'add-form' },
      h('button', { type: 'submit', class: 'btn btn--primary', 'data-focus-key': 'form-save', disabled: ui.busy }, note ? 'Speichern' : 'Anpinnen'),
      h('button', { type: 'button', class: 'btn btn--ghost', onclick: () => closeForm(ctx) }, 'Abbrechen'),
      note && h('button', {
        type: 'button', class: 'btn btn--icon btn--danger pin-form__delete', 'aria-label': 'Zettel abnehmen', title: 'Abnehmen',
        onclick: () => {
          closeForm(ctx);
          deleteNote(note);
          showToast(`„${note.title}“ abgenommen`, { actionLabel: 'Rückgängig', onAction: () => restoreNote(note) });
        },
      }, icon('muell', { wash: false })),
    ),
    note?.createdBy && h('p', { class: 'task-edit__by' }, byline(note.createdBy, `angepinnt ${formatWhen(note.createdAt)}`)),
  );
}

async function saveNote(note, ctx) {
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
  ui.busy = false;
  if (!saved) { ctx.rerender(); return; }
  closeForm(ctx);
  showToast(note ? 'Gespeichert ♡' : `„${title}“ hängt an der Pinnwand ♡`);
}

// =====================================================================
// Ordner
// =====================================================================
function foldersPage(state, ctx) {
  const folders = state.folders || [];
  const q = ui.search.trim().toLocaleLowerCase('de');
  const hits = q
    ? (state.docs || []).filter((d) => `${d.name} ${d.note || ''}`.toLocaleLowerCase('de').includes(q))
    : null;
  return [
    backLink('#/pinnwand', 'Pinnwand'),
    viewHeader({ id: 'title-pinnwand', title: 'Ordner', subtitle: 'Verträge, Dokumente & Fotos von Papieren' }),
    h('div', { class: 'folder-page' },
      h('label', { class: 'search' },
        icon('suche', { wash: false }),
        h('input', {
          class: 'input search__input', type: 'search', placeholder: 'In allen Dateien suchen …', 'aria-label': 'In allen Dateien suchen',
          'data-focus-key': 'doc-search', autocomplete: 'off', enterkeyhint: 'search', value: ui.search,
          oninput: (e) => { ui.search = e.target.value; ctx.rerender(); },
        }),
      ),
      hits
        ? h('section', { class: 'card doc-card', 'data-tone': 5 },
          h('div', { class: 'card__header' },
            h('span', { class: 'card__icon' }, icon('suche')),
            h('h2', { class: 'card__title' }, hits.length ? plural(hits.length, 'Treffer', 'Treffer') : 'Nichts gefunden'),
          ),
          hits.length > 0 && h('ul', { class: 'doc-list' }, hits.map((d) => docRow(d, state, ctx, { showFolder: true }))),
        )
        : h('div', { class: 'folders' },
          folders.map((f, i) => h('a', { class: 'folder', href: `#/pinnwand/ordner/${f.id}`, 'data-tone': (i % 6) + 1 },
            h('span', { class: 'folder__name' }, f.name),
            h('span', { class: 'folder__count' }, plural(docsIn(f).length, 'Datei', 'Dateien')),
          )),
          ui.newFolder === null
            ? h('button', {
              type: 'button', class: 'folder folder--new', 'data-focus-key': 'folder-new',
              onclick: () => { ui.newFolder = ''; ctx.rerender(); focusLater('[data-focus-key="folder-new-name"]'); },
            }, icon('plus', { wash: false }), h('span', { class: 'folder__name' }, 'Neuer Ordner'))
            : h('form', {
              class: 'folder folder--form',
              onsubmit: async (e) => {
                e.preventDefault();
                const name = ui.newFolder.trim();
                if (!name) return;
                if (await addFolder(name)) { ui.newFolder = null; showToast(`Ordner „${name}“ angelegt`); ctx.rerender(); }
              },
              onkeydown: (e) => { if (e.key === 'Escape') { ui.newFolder = null; ctx.rerender(); } },
            },
              h('input', {
                class: 'input', type: 'text', maxlength: 40, placeholder: 'Name, z. B. Versicherungen', 'aria-label': 'Name des neuen Ordners',
                'data-focus-key': 'folder-new-name', autocomplete: 'off', enterkeyhint: 'done', value: ui.newFolder,
                oninput: (e) => { ui.newFolder = e.target.value; },
              }),
              h('div', { class: 'add-form' },
                h('button', { type: 'submit', class: 'btn btn--primary btn--small' }, 'Anlegen'),
                h('button', { type: 'button', class: 'btn btn--ghost btn--small', onclick: () => { ui.newFolder = null; ctx.rerender(); } }, 'Abbrechen'),
              ),
            ),
        ),
    ),
  ];
}

// ---------- Ein Unterordner ----------
function folderPage(folder, state, ctx) {
  if (ui.pendingFolder !== folder.id) { ui.pending = []; ui.pendingFolder = folder.id; } // anderer Ordner -> Auswahl verwerfen
  const docs = docsIn(folder).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const editing = ui.folderEdit?.id === folder.id;
  const picker = h('input', {
    type: 'file', accept: 'application/pdf,image/*', multiple: true, class: 'visually-hidden', tabindex: '-1',
    onchange: async (e) => {
      const chosen = [...(e.target.files || [])];
      e.target.value = '';
      for (const file of chosen) {
        const prepared = await prepareFile(file);
        if (prepared) ui.pending.push(prepared);
      }
      ctx.rerender();
      focusLater('[data-focus-key="pending-name-0"]');
    },
  });
  return [
    backLink('#/pinnwand/ordner', 'Ordner'),
    editing
      ? folderEditForm(folder, ctx)
      : viewHeader({
        id: 'title-pinnwand', title: folder.name, subtitle: plural(docs.length, 'Datei', 'Dateien'),
        actions: [h('button', {
          type: 'button', class: 'btn btn--icon', 'aria-label': 'Ordner umbenennen oder löschen', title: 'Ordner bearbeiten',
          'data-focus-key': 'folder-edit',
          onclick: () => { ui.folderEdit = { id: folder.id, name: folder.name }; ctx.rerender(); focusLater('[data-focus-key="folder-edit-name"]'); },
        }, icon('stift', { wash: false }))],
      }),
    h('div', { class: 'folder-page' },
      ui.pending.length > 0
        ? pendingForm(folder, ctx)
        : h('div', { class: 'add-form add-form--tight' },
          h('button', { type: 'button', class: 'btn btn--primary', 'data-focus-key': 'doc-add', onclick: () => picker.click() },
            iconLabel('plus', 'PDF oder Foto hinzufügen')),
          picker,
        ),
      h('section', { class: 'card doc-card', 'data-tone': 5 },
        docs.length
          ? h('ul', { class: 'doc-list' }, docs.map((d) => docRow(d, state, ctx)))
          : h('p', { class: 'muted doc-card__empty' }, 'Noch leer – oben eine Datei hinzufügen.'),
      ),
    ),
  ];
}

function folderEditForm(folder, ctx) {
  const close = () => { ui.folderEdit = null; ctx.rerender(); };
  return h('form', {
    class: 'card folder-edit', 'data-tone': 5,
    onsubmit: async (e) => {
      e.preventDefault();
      const name = ui.folderEdit.name.trim();
      if (!name) return;
      if (name !== folder.name && !(await updateFolder(folder, { name }))) return;
      close();
    },
    onkeydown: (e) => { if (e.key === 'Escape') close(); },
  },
    h('label', { class: 'choice' },
      h('span', { class: 'choice__legend' }, 'Name des Ordners'),
      h('input', {
        class: 'input', type: 'text', maxlength: 40, 'data-focus-key': 'folder-edit-name', autocomplete: 'off', value: ui.folderEdit.name,
        oninput: (e) => { ui.folderEdit.name = e.target.value; },
      }),
    ),
    h('div', { class: 'add-form' },
      h('button', { type: 'submit', class: 'btn btn--primary' }, 'Speichern'),
      h('button', { type: 'button', class: 'btn btn--ghost', onclick: close }, 'Abbrechen'),
      h('button', {
        type: 'button', class: 'btn btn--icon btn--danger pin-form__delete', 'aria-label': 'Ordner löschen', title: 'Ordner löschen',
        onclick: async () => {
          if (docsIn(folder).length) {
            showToast('Im Ordner liegen noch Dateien – bitte erst löschen oder verschieben', { variant: 'error' });
            return;
          }
          if (!confirm(`Ordner „${folder.name}“ löschen?`)) return;
          ui.folderEdit = null;
          if (await deleteFolder(folder)) { showToast(`Ordner „${folder.name}“ gelöscht`); location.hash = '#/pinnwand/ordner'; }
        },
      }, icon('muell', { wash: false })),
    ),
  );
}

// ---------- Ausgesuchte Dateien: Name + Notiz, dann hochladen ----------
function pendingForm(folder, ctx) {
  const cancel = () => { ui.pending = []; ctx.rerender(); };
  return h('form', {
    class: 'card pending', 'data-tone': 3,
    onsubmit: async (e) => {
      e.preventDefault();
      if (ui.uploading) return;
      ui.uploading = true;
      ctx.rerender();
      let ok = 0;
      for (const p of [...ui.pending]) {
        const name = p.name.trim() || (p.type === 'pdf' ? 'Dokument' : 'Foto');
        if (await uploadDoc(folder, p.blob, name, p.note.trim())) {
          ok++;
          ui.pending.splice(ui.pending.indexOf(p), 1);
        }
      }
      ui.uploading = false;
      if (ok) showToast(ok === 1 ? 'Datei liegt im Ordner ♡' : `${ok} Dateien liegen im Ordner ♡`);
      ctx.rerender();
    },
    onkeydown: (e) => { if (e.key === 'Escape') cancel(); },
  },
    h('div', { class: 'card__header' },
      h('span', { class: 'card__icon' }, icon('klammer')),
      h('h2', { class: 'card__title' }, ui.pending.length === 1 ? 'Neue Datei' : `${ui.pending.length} neue Dateien`),
    ),
    ui.pending.map((p, i) => h('div', { class: 'pending__item' },
      h('div', { class: 'pending__top' },
        icon(p.type === 'pdf' ? 'dokument' : 'kamera', { wash: false }),
        h('input', {
          class: 'input', type: 'text', maxlength: 110, 'aria-label': 'Name', 'data-focus-key': `pending-name-${i}`,
          autocomplete: 'off', value: p.name, oninput: (e) => { p.name = e.target.value; },
        }),
        h('button', {
          type: 'button', class: 'btn btn--icon btn--ghost', 'aria-label': 'Nicht hochladen', title: 'Weglassen',
          onclick: () => { ui.pending.splice(i, 1); ctx.rerender(); },
        }, icon('kreuz', { wash: false })),
      ),
      h('textarea', {
        class: 'input input--area', rows: 2, maxlength: 1000, placeholder: 'Notiz (optional), z. B. „Kündigungsfrist 3 Monate“',
        'aria-label': 'Notiz', 'data-focus-key': `pending-note-${i}`, value: p.note, oninput: (e) => { p.note = e.target.value; },
      }),
    )),
    h('div', { class: 'add-form' },
      h('button', { type: 'submit', class: 'btn btn--primary', 'data-focus-key': 'pending-save', disabled: ui.uploading },
        ui.uploading ? 'lädt hoch …' : 'In den Ordner legen'),
      h('button', { type: 'button', class: 'btn btn--ghost', onclick: cancel, disabled: ui.uploading }, 'Abbrechen'),
    ),
  );
}

/** PDF prüfen bzw. Foto verkleinern (entfernt auch GPS-Daten). */
async function prepareFile(file) {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  const base = file.name.replace(/\.[^.]+$/, '');
  if (isPdf) {
    if (file.size > MAX_PDF_MB * 1024 * 1024) {
      showToast(`„${file.name}“ ist zu groß (höchstens ${MAX_PDF_MB} MB)`, { variant: 'error' });
      return null;
    }
    return { blob: new Blob([await file.arrayBuffer()], { type: 'application/pdf' }), name: base, type: 'pdf', note: '' };
  }
  try {
    const blob = await shrink(file, { maxSize: 2400 });
    return { blob, name: base, type: 'jpg', note: '' };
  } catch {
    showToast(`„${file.name}“ konnte nicht gelesen werden – bitte PDF oder Foto`, { variant: 'error' });
    return null;
  }
}

// ---------- Eine Datei ----------
function docRow(doc, state, ctx, { showFolder = false } = {}) {
  if (ui.docEdit?.id === doc.id) return h('li', { class: 'doc doc--editing' }, docEditForm(doc, state, ctx));
  const day = new Date(doc.createdAt).toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric', year: 'numeric' });
  const folder = showFolder ? folderById(doc.folderId) : null;
  const inner = [
    h('span', { class: 'doc__icon' }, icon(doc.type === 'pdf' ? 'dokument' : 'kamera', { wash: false })),
    h('span', { class: 'doc__text' },
      h('span', { class: 'doc__name' }, doc.name),
      doc.note && h('span', { class: 'doc__note' }, doc.note),
      h('span', { class: 'doc__meta' },
        folder && h('span', { class: 'doc__folder' }, icon('ordner', { wash: false }), folder.name),
        byline(doc.addedBy, `${day} · ${formatSize(doc.size)}`)),
    ),
  ];
  return h('li', { class: 'doc' },
    doc.type === 'jpg'
      ? h('button', { type: 'button', class: 'doc__open', 'aria-label': `${doc.name} ansehen`, onclick: () => overlay(doc.name, h('img', { class: 'doc-image', src: api.docUrl(doc), alt: doc.name }), 'lightbox--doc') }, inner)
      : h('a', { class: 'doc__open', href: api.docUrl(doc), target: '_blank', rel: 'noopener', 'aria-label': `${doc.name} öffnen` }, inner),
    h('button', {
      type: 'button', class: 'btn btn--icon btn--ghost doc__edit', 'aria-label': `${doc.name} bearbeiten`, title: 'Bearbeiten',
      'data-focus-key': `doc-edit-${doc.id}`,
      onclick: () => {
        ui.docEdit = { id: doc.id, name: doc.name.replace(/\.(pdf|jpg)$/i, ''), note: doc.note || '', folderId: doc.folderId };
        ctx.rerender();
        focusLater('[data-focus-key="doc-name"]');
      },
    }, icon('stift', { wash: false })),
  );
}

function docEditForm(doc, state, ctx) {
  const d = ui.docEdit;
  const close = () => { ui.docEdit = null; ctx.rerender(); };
  return h('form', {
    class: 'pin-form',
    onsubmit: async (e) => {
      e.preventDefault();
      const name = d.name.trim();
      if (!name) return;
      const patch = {};
      if (`${name}.${doc.type}` !== doc.name) patch.name = name;
      if ((d.note.trim() || null) !== doc.note) patch.note = d.note.trim() || null;
      if (d.folderId !== doc.folderId) patch.folderId = d.folderId;
      close();
      if (Object.keys(patch).length && await updateDoc(doc, patch)) {
        showToast(patch.folderId ? `Verschoben nach „${folderById(patch.folderId)?.name}“` : 'Gespeichert ♡');
      }
    },
    onkeydown: (e) => { if (e.key === 'Escape') close(); },
  },
    h('label', { class: 'choice' },
      h('span', { class: 'choice__legend' }, 'Name'),
      h('input', {
        class: 'input', type: 'text', maxlength: 110, 'data-focus-key': 'doc-name', autocomplete: 'off', value: d.name,
        oninput: (e) => { d.name = e.target.value; },
      }),
    ),
    h('label', { class: 'choice' },
      h('span', { class: 'choice__legend' }, 'Notiz'),
      h('textarea', {
        class: 'input input--area', rows: 2, maxlength: 1000, 'data-focus-key': 'doc-note', value: d.note,
        oninput: (e) => { d.note = e.target.value; },
      }),
    ),
    (state.folders || []).length > 1 && h('label', { class: 'choice' },
      h('span', { class: 'choice__legend' }, 'Liegt im Ordner'),
      h('select', {
        class: 'input', 'data-focus-key': 'doc-folder',
        onchange: (e) => { d.folderId = Number(e.target.value); },
      }, state.folders.map((f) => h('option', { value: f.id, selected: f.id === d.folderId }, f.name))),
    ),
    h('div', { class: 'add-form' },
      h('button', { type: 'submit', class: 'btn btn--primary', 'data-focus-key': 'doc-save' }, 'Speichern'),
      h('button', { type: 'button', class: 'btn btn--ghost', onclick: close }, 'Abbrechen'),
      h('button', {
        type: 'button', class: 'btn btn--icon btn--danger pin-form__delete', 'aria-label': 'Datei löschen', title: 'Löschen',
        onclick: () => {
          if (!confirm(`„${doc.name}“ wirklich löschen?`)) return;
          close();
          deleteDoc(doc);
          showToast(`„${doc.name}“ gelöscht`);
        },
      }, icon('muell', { wash: false })),
    ),
  );
}

const formatSize = (bytes) => (bytes >= 1024 * 1024
  ? `${(bytes / 1024 / 1024).toLocaleString('de-DE', { maximumFractionDigits: 1 })} MB`
  : `${Math.max(1, Math.round(bytes / 1024))} KB`);

function focusLater(selector) {
  requestAnimationFrame(() => document.querySelector(selector)?.focus({ preventScroll: true }));
}
