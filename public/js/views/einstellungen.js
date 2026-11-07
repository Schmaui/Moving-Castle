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
import { messageNote, drawingSvg, openPad, PAPERS } from '../ui/door.js';
import {
  pushSupport, currentSubscription, enablePush, disablePush, savePrefs, testPush, loadPrefs, refreshPush,
} from '../push.js';
import { formatWhen } from '../util.js';
import { APP_ICONS, appIcon, setAppIcon, iconUrl } from '../appicon.js';
import { isStandalone } from '../push.js';
import {
  addPhoto, deletePhoto, updatePhoto, sortedPhotos, updateSettings, logout,
  updatePerson, uploadAvatar, removeAvatar, addMessage, deleteMessage, messagesFromMe, me, myPrefs, updateMyPrefs,
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
const note = { body: '', drawing: [], paper: 'gelb', busy: false }; // angefangene Nachricht an die Tür

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
        messageSection(state, ctx),
        peopleSection(state, ctx),
        photosSection(ctx),
        fridgeSection(state),
        notifySection(ctx),
        widgetSection(state, ctx),
        calendarSection(state, ctx),
        deviceSection(state, ctx),
      ),
    ];
  },
};

// ---------- Nachricht an die Tür ----------
// Geht immer an die andere Person. Sie sieht sie beim nächsten Öffnen der App auf der
// geschlossenen Kühlschranktür (ui/door.js). Nach 24 Stunden ist sie von selbst weg.
function messageSection(state, ctx) {
  const mine = me();
  const other = mine && state.people.find((p) => p.id !== mine.id);
  const sub = other ? `für ${other.name} – hängt beim nächsten Öffnen an der Tür, 24 Stunden lang` : 'ein kleiner Gruß an der Kühlschranktür';
  if (!mine || !other) {
    return section('Nachricht an die Tür', 'stift', sub, 2,
      h('p', { class: 'muted' }, mine ? 'Es gibt noch niemanden, an den die Nachricht gehen kann.' : 'Wähle unten bei „Dieses Gerät“ erst aus, wer du bist.'));
  }
  const send = async (e) => {
    e.preventDefault();
    if (note.busy) return;
    const body = note.body.trim();
    if (!body && !note.drawing.length) {
      showToast('Schreib oder mal erst etwas ♡');
      return;
    }
    note.busy = true;
    const ok = await addMessage({ body: body || null, drawing: note.drawing.length ? note.drawing : null, paper: note.paper, toPerson: other.id });
    note.busy = false;
    if (ok) {
      Object.assign(note, { body: '', drawing: [] });
      showToast(`Hängt an der Tür – ${other.name} sieht sie beim nächsten Öffnen ♡`);
    }
    ctx.rerender();
  };
  const sent = messagesFromMe();
  return section('Nachricht an die Tür', 'stift', sub, 2,
    h('form', { class: 'note-compose', onsubmit: send },
      h('div', { class: ['door-note', 'door-note--compose', `door-note--${note.paper}`] },
        h('span', { class: 'door-note__magnet', 'data-tone': mine.tone || 1, 'aria-hidden': 'true' }),
        h('textarea', {
          class: 'door-note__input', rows: 3, maxlength: 300, placeholder: `Liebe Grüße an ${other.name} …`,
          'aria-label': 'Nachricht', 'data-focus-key': 'msg-body', value: note.body,
          oninput: (e) => { note.body = e.target.value; },
        }),
        note.drawing.length > 0 && h('button', {
          type: 'button', class: 'note-compose__drawing', 'aria-label': 'Bild ändern', 'data-focus-key': 'msg-drawing',
          onclick: () => openPad(note.drawing, (strokes) => { note.drawing = strokes; ctx.rerender(); }),
        }, drawingSvg(note.drawing, { className: 'door-note__drawing', label: 'dein Bild' })),
      ),
      h('div', { class: 'note-compose__papers', role: 'group', 'aria-label': 'Farbe des Zettels' },
        PAPERS.map((p) => h('button', {
          type: 'button', class: ['paper-dot', `paper-dot--${p.id}`, p.id === note.paper && 'is-chosen'],
          'aria-pressed': String(p.id === note.paper), 'aria-label': `Zettel ${p.label}`, title: p.label,
          'data-focus-key': `msg-paper-${p.id}`,
          onclick: () => { note.paper = p.id; ctx.rerender(); },
        }))),
      h('div', { class: 'add-form' },
        h('button', { type: 'submit', class: 'btn btn--primary', 'data-focus-key': 'msg-send', disabled: note.busy }, iconLabel('herz', 'An die Tür hängen')),
        h('button', {
          type: 'button', class: 'btn', 'data-focus-key': 'msg-draw',
          onclick: () => openPad(note.drawing, (strokes) => { note.drawing = strokes; ctx.rerender(); }),
        }, note.drawing.length ? 'Bild ändern' : 'Etwas malen'),
      ),
    ),
    sent.length > 0 && h('div', { class: 'note-sent' },
      h('p', { class: 'choice__legend' }, 'Hängt gerade an der Tür:'),
      h('ul', { class: 'note-sent__list' }, sent.map((m) => h('li', { class: 'note-sent__item' },
        messageNote(m, { className: 'door-note--small' }),
        h('button', {
          type: 'button', class: 'btn btn--small btn--ghost', 'data-focus-key': `msg-del-${m.id}`,
          onclick: () => { if (confirm('Diese Nachricht von der Tür abnehmen?')) deleteMessage(m); },
        }, 'Abnehmen'),
      ))),
    ),
  );
}

// ---------- Benachrichtigungen (nur iPhone, pro Handy eingestellt – js/push.js) ----------
const notify = { status: null, busy: false, checked: false };
const KIND_LABELS = [
  { id: 'tuer', label: 'Nachricht an der Tür' },
  { id: 'liste', label: 'Etwas auf der Liste' },
  { id: 'aufgaben', label: 'Aufgaben (morgens)' },
  { id: 'termine', label: 'Termine (morgens)' },
];

function notifySection(ctx) {
  const support = pushSupport();
  const sub = 'kommen aufs iPhone – deine Einstellungen gelten nur für dich';
  if (support === 'not-ios') {
    return section('Benachrichtigungen', 'uhr', 'kommen aufs iPhone', 4,
      h('p', { class: 'muted' }, 'Benachrichtigungen gibt es nur auf dem iPhone. Öffne dort die App über das Symbol auf dem Home-Bildschirm und schalte sie hier unter „Mehr“ ein.'));
  }
  if (support === 'needs-home') {
    return section('Benachrichtigungen', 'uhr', sub, 4,
      h('p', {}, 'Damit dein iPhone Benachrichtigungen bekommt, muss die App als Symbol auf dem Home-Bildschirm liegen:'),
      h('ol', { class: 'steps' },
        h('li', {}, 'In Safari unten auf „Teilen“ tippen (Viereck mit Pfeil nach oben).'),
        h('li', {}, 'Nach unten scrollen, „Zum Home-Bildschirm“ wählen, dann „Hinzufügen“.'),
        h('li', {}, 'Die App über das neue Symbol öffnen und hier unter „Mehr“ einschalten.'),
      ));
  }
  if (support === 'too-old') {
    return section('Benachrichtigungen', 'uhr', sub, 4,
      h('p', {}, 'Dafür braucht dein iPhone iOS 16.4 oder neuer: Einstellungen → Allgemein → Softwareupdate.'));
  }
  if (support === 'denied') {
    return section('Benachrichtigungen', 'uhr', sub, 4,
      h('p', {}, 'Benachrichtigungen sind auf diesem iPhone ausgeschaltet. So erlaubst du sie wieder: iPhone-Einstellungen → Mitteilungen → moving castle → „Mitteilungen erlauben“.'));
  }
  if (!notify.checked) {
    notify.checked = true;
    currentSubscription().then((s) => { notify.status = s ? 'on' : 'off'; ctx.rerender(); });
  }
  if (notify.status === null) return section('Benachrichtigungen', 'uhr', sub, 4, h('p', { class: 'muted' }, 'Einen Moment …'));

  const busy = (fn) => async () => {
    if (notify.busy) return;
    notify.busy = true;
    ctx.rerender();
    try { await fn(); } catch (err) {
      showToast(err?.message || 'Das hat nicht geklappt', { variant: 'error' });
    } finally {
      notify.busy = false;
      ctx.rerender();
    }
  };
  if (notify.status === 'off') {
    return section('Benachrichtigungen', 'uhr', sub, 4,
      h('p', {}, 'Bekomm Bescheid, wenn eine Nachricht an der Tür hängt, etwas auf die Liste kommt – und morgens, was heute ansteht.'),
      h('div', { class: 'add-form' },
        h('button', {
          type: 'button', class: 'btn btn--primary', 'data-focus-key': 'push-on', disabled: notify.busy,
          onclick: busy(async () => {
            const r = await enablePush();
            if (r.ok) { notify.status = 'on'; showToast('Benachrichtigungen sind an ♡'); }
            else if (r.reason === 'denied') showToast('Abgelehnt – in den iPhone-Einstellungen wieder erlauben', { variant: 'error' });
          }),
        }, iconLabel('uhr', notify.busy ? 'Einen Moment …' : 'Benachrichtigungen einschalten')),
      ));
  }

  const p = structuredClone(loadPrefs()); // pro Person gespeichert (js/push.js)
  const save = () => { savePrefs(p).catch((err) => showToast(err?.message || 'Speichern fehlgeschlagen', { variant: 'error' })); ctx.rerender(); };
  const timeInput = (key, value, label, onSet) => h('label', { class: 'time-field' },
    h('span', {}, label),
    h('input', {
      class: 'input input--time', type: 'time', value, 'data-focus-key': key, required: true,
      onchange: (e) => { if (/^\d\d:\d\d$/.test(e.target.value)) { onSet(e.target.value); save(); } },
    }));
  return section('Benachrichtigungen', 'uhr', sub, 4,
    h('fieldset', { class: 'choice' },
      h('legend', { class: 'choice__legend' }, 'Was soll kommen?'),
      h('div', { class: 'pills' }, KIND_LABELS.map((k) => h('button', {
        type: 'button', class: ['pill', p.kinds[k.id] && 'is-chosen'], 'aria-pressed': String(p.kinds[k.id]),
        'data-focus-key': `push-kind-${k.id}`,
        onclick: () => { p.kinds[k.id] = !p.kinds[k.id]; save(); },
      }, k.label))),
    ),
    (p.kinds.aufgaben || p.kinds.termine) && h('div', { class: 'choice' },
      timeInput('push-morning', p.morning, 'Morgens um', (v) => { p.morning = v; })),
    h('fieldset', { class: 'choice' },
      h('legend', { class: 'choice__legend' }, 'Ruhezeit (dann wartet alles bis danach)'),
      h('div', { class: 'segmented' }, [{ v: true, l: 'an' }, { v: false, l: 'aus' }].map((o) => h('button', {
        type: 'button', class: ['segmented__item', p.quiet.on === o.v && 'is-chosen'], 'aria-pressed': String(p.quiet.on === o.v),
        'data-focus-key': `push-quiet-${o.l}`,
        onclick: () => { p.quiet.on = o.v; save(); },
      }, o.l))),
      p.quiet.on && h('div', { class: 'time-row' },
        timeInput('push-quiet-from', p.quiet.from, 'von', (v) => { p.quiet.from = v; }),
        timeInput('push-quiet-to', p.quiet.to, 'bis', (v) => { p.quiet.to = v; })),
    ),
    h('div', { class: 'add-form' },
      h('button', {
        type: 'button', class: 'btn', 'data-focus-key': 'push-test', disabled: notify.busy,
        onclick: busy(async () => { await testPush(); showToast('Test ist unterwegs – gleich sollte es klingeln ♡'); }),
      }, 'Test schicken'),
      h('button', {
        type: 'button', class: 'btn btn--ghost', 'data-focus-key': 'push-off', disabled: notify.busy,
        onclick: busy(async () => { await disablePush(); notify.status = 'off'; showToast('Benachrichtigungen sind aus'); }),
      }, 'Ausschalten'),
    ),
  );
}

// ---------- Widget (iPhone-Home-Bildschirm über die App „Scriptable“) ----------
const wid = { info: null, loading: false, script: null, busy: false };
const WIDGET_LABELS = [
  { id: 'liste', label: 'Einkaufsliste' },
  { id: 'aufgaben', label: 'Aufgaben heute' },
  { id: 'essen', label: 'Was gibt’s heute?' },
  { id: 'tuer', label: 'Nachricht an der Tür' },
  { id: 'termine', label: 'Termine heute' },
];

async function widgetScript(key) {
  const res = await fetch('/widget/moving-castle-widget.js', { cache: 'no-store' });
  if (!res.ok) throw new Error('Skript nicht gefunden');
  return (await res.text())
    .replace("'__APP__'", JSON.stringify(location.origin))
    .replace("'__KEY__'", JSON.stringify(key));
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast('Skript kopiert ✓ – jetzt in Scriptable einfügen');
  } catch {
    const area = document.querySelector('[data-focus-key="widget-script"]');
    area?.focus();
    area?.select();
    showToast('Bitte das markierte Skript selbst kopieren', { variant: 'error' });
  }
}

function widgetSection(state, ctx) {
  if (!me()) return null;
  const sub = 'Einkaufsliste & Co. auf dem iPhone-Home-Bildschirm (und am Mac)';
  if (!wid.info && !wid.loading) {
    wid.loading = true;
    api.widgetInfo().then((info) => { wid.info = info; }).catch(() => { wid.info = { hasKey: false, show: ['liste', 'aufgaben', 'essen', 'tuer'], failed: true }; })
      .finally(() => { wid.loading = false; ctx.rerender(); });
  }
  if (!wid.info) return section('Widget', 'klemmbrett', sub, 6, h('p', { class: 'muted' }, 'Einen Moment …'));
  const info = wid.info;
  const run = (fn) => async () => {
    if (wid.busy) return;
    wid.busy = true;
    ctx.rerender();
    try { await fn(); } catch (err) {
      showToast(err?.message || 'Das hat nicht geklappt', { variant: 'error' });
    } finally {
      wid.busy = false;
      ctx.rerender();
    }
  };
  const setup = run(async () => {
    const { key } = await api.widgetKey();
    await api.widgetShow(info.show);
    wid.script = await widgetScript(key);
    info.hasKey = true;
    info.usedAt = null;
  });
  const toggle = (id) => run(async () => {
    const next = info.show.includes(id) ? info.show.filter((x) => x !== id) : WIDGET_LABELS.map((l) => l.id).filter((x) => x === id || info.show.includes(x));
    info.show = next;
    if (info.hasKey) await api.widgetShow(next);
  });

  return section('Widget', 'klemmbrett', sub, 6,
    h('fieldset', { class: 'choice' },
      h('legend', { class: 'choice__legend' }, 'Was soll das Widget zeigen?'),
      h('div', { class: 'pills' }, WIDGET_LABELS.map((l) => h('button', {
        type: 'button', class: ['pill', info.show.includes(l.id) && 'is-chosen'], 'aria-pressed': String(info.show.includes(l.id)),
        'data-focus-key': `widget-show-${l.id}`, onclick: toggle(l.id),
      }, l.label))),
      h('p', { class: 'settings__sub' }, 'Klein: der erste Zettel · Mittel: zwei nebeneinander · Groß: bis zu vier'),
    ),
    wid.script ? widgetSteps(ctx)
      : info.hasKey
        ? h('div', { class: 'choice' },
          h('p', {}, '✓ Eingerichtet', info.usedAt && h('span', { class: 'muted' }, ` · zuletzt aktualisiert ${formatWhen(info.usedAt)}`)),
          h('div', { class: 'add-form' },
            h('button', {
              type: 'button', class: 'btn', 'data-focus-key': 'widget-again', disabled: wid.busy,
              onclick: () => { if (confirm('Neu einrichten? Das bisherige Widget zeigt dann erst wieder etwas, wenn du das neue Skript in Scriptable einfügst.')) setup(); },
            }, 'Neu einrichten'),
            h('button', {
              type: 'button', class: 'btn btn--ghost', 'data-focus-key': 'widget-off', disabled: wid.busy,
              onclick: () => {
                if (!confirm('Widget abschalten? Es zeigt dann nichts mehr an.')) return;
                run(async () => { await api.widgetRemove(); info.hasKey = false; })();
              },
            }, 'Abschalten'),
          ))
        : h('div', { class: 'choice' },
          h('p', {}, 'Dafür brauchst du die kostenlose App „Scriptable“ aus dem App Store. Die App erstellt dir ein fertiges Skript zum Einfügen.'),
          h('div', { class: 'add-form' },
            h('button', { type: 'button', class: 'btn btn--primary', 'data-focus-key': 'widget-setup', disabled: wid.busy, onclick: setup },
              iconLabel('plus', wid.busy ? 'Einen Moment …' : 'Widget einrichten')))),
  );
}

function widgetSteps(ctx) {
  return h('div', { class: 'choice widget-setup' },
    h('ol', { class: 'steps' },
      h('li', {}, '„Scriptable“ aus dem App Store laden (kostenlos).'),
      h('li', {}, h('button', { type: 'button', class: 'btn btn--primary btn--small', 'data-focus-key': 'widget-copy', onclick: () => copyText(wid.script) }, 'Skript kopieren')),
      h('li', {}, 'Scriptable öffnen, oben rechts auf „+“ tippen, ins leere Feld tippen und „Einsetzen“ wählen.'),
      h('li', {}, 'Oben auf „Untitled Script“ tippen, „moving castle“ nennen, dann „Done“.'),
      h('li', {}, 'Home-Bildschirm lange drücken → oben links „+“ (bzw. „Bearbeiten → Widget hinzufügen“) → „Scriptable“ suchen → Größe wählen → „Widget hinzufügen“.'),
      h('li', {}, 'Das neue Widget antippen (oder lange drücken → „Widget bearbeiten“) und bei „Script“ „moving castle“ wählen. Fertig ♡'),
      h('li', {}, 'Am Mac (ab macOS Sonoma): Systemeinstellungen → Schreibtisch & Dock → „iPhone-Widgets verwenden“ an. Dann Rechtsklick auf den Schreibtisch → „Widgets bearbeiten“ → Scriptable.'),
    ),
    h('p', { class: 'settings__sub' }, 'Das Skript enthält einen geheimen Schlüssel – bitte nicht weitergeben.'),
    h('textarea', { class: 'input widget-setup__script', readonly: true, rows: 3, 'aria-label': 'Widget-Skript', 'data-focus-key': 'widget-script', value: wid.script }),
    h('button', { type: 'button', class: 'btn btn--ghost btn--small', onclick: () => { wid.script = null; ctx.rerender(); } }, 'Fertig'),
  );
}

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
  return section('Galerie', 'kamera', photos.length
    ? `${photos.length} ${photos.length === 1 ? 'Foto' : 'Fotos'} – an der Küchentür hängen immer ein paar davon, bei jedem Öffnen andere`
    : 'an der Küchentür hängen immer ein paar davon, bei jedem Öffnen andere', 1,
    photos.length === 0 && !draft.blob && h('p', { class: 'muted' }, 'Noch keine Fotos – lad das erste hoch!'),
    h('ul', { class: 'gallery' }, photos.map((photo) => photoRow(photo))),
    draft.blob ? draftForm(ctx) : addButton(ctx),
  );
}

function photoRow(photo) {
  const key = `cap-${photo.id}`;
  const save = () => {
    const value = (captions[photo.id] ?? photo.caption ?? '').trim();
    delete captions[photo.id];
    if (value !== (photo.caption || '')) updatePhoto(photo, { caption: value || null });
  };
  return h('li', { class: 'gallery__item' },
    h('button', {
      type: 'button', class: 'gallery__thumb', 'aria-label': 'Foto groß ansehen',
      onclick: () => openLightbox(photo),
    }, h('img', { src: api.photoUrl(photo), alt: '', loading: 'lazy' })),
    h('input', {
      class: 'gallery__caption', type: 'text', maxlength: 60, placeholder: 'Unterschrift …',
      'aria-label': 'Bildunterschrift', 'data-focus-key': key, autocomplete: 'off', enterkeyhint: 'done',
      value: captions[photo.id] ?? photo.caption ?? '',
      oninput: (e) => { captions[photo.id] = e.target.value; },
      onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } },
      onblur: save,
    }),
    h('button', {
      type: 'button', class: 'btn btn--icon btn--danger gallery__remove', 'aria-label': 'Foto löschen', title: 'Löschen',
      'data-focus-key': `photo-del-${photo.id}`,
      onclick: () => { if (confirm('Dieses Foto aus der Galerie löschen?')) deletePhoto(photo); },
    }, icon('muell', { wash: false })),
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
      iconLabel('plus', 'Foto hochladen')),
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
  const mine = myPrefs(); // pro Person – jede/r hat die eigene Tür
  const color = mine.fridgeColor || 'mauve';
  const every = mine.photoEvery ?? 2;
  return section('Kühlschrank', 'milch', me() ? `Aussehen deiner Tür – nur für ${me().name}` : 'Aussehen der Tür', 3,
    h('fieldset', { class: 'choice' },
      h('legend', { class: 'choice__legend' }, 'Farbe der Tür'),
      h('div', { class: 'swatches' }, FRIDGE_COLORS.map((c) => h('button', {
        type: 'button',
        class: ['swatch', c.id === color && 'is-chosen'],
        'data-fridge-swatch': c.id,
        'aria-pressed': String(c.id === color),
        'data-focus-key': `color-${c.id}`,
        onclick: () => (me() ? updateMyPrefs({ fridgeColor: c.id }) : updateSettings({ fridgeColor: c.id })),
      }, h('span', { class: 'swatch__dot' }), h('span', { class: 'swatch__label' }, c.label)))),
    ),
    h('fieldset', { class: 'choice' },
      h('legend', { class: 'choice__legend' }, 'Fotos an der Tür'),
      h('div', { class: 'segmented' }, PHOTO_EVERY.map((o) => h('button', {
        type: 'button',
        class: ['segmented__item', (o.value > 0) === (every > 0) && 'is-chosen'],
        'aria-pressed': String((o.value > 0) === (every > 0)),
        'data-focus-key': `every-${o.value}`,
        onclick: () => (me() ? updateMyPrefs({ photoEvery: o.value }) : updateSettings({ photoEvery: o.value })),
      }, o.label))),
    ),
  );
}

// ---------- Dieses Gerät ----------
function deviceSection(state, ctx) {
  const mine = myId();
  return section('Dieses Gerät', 'tuer', 'gilt nur für dieses Handy/diesen Computer – alles andere merkt sich die App für dich', 4,
    state.people.length > 0 && h('fieldset', { class: 'choice' },
      h('legend', { class: 'choice__legend' }, 'Hier bin ich:'),
      h('div', { class: 'pills' }, state.people.map((p) => h('button', {
        type: 'button',
        class: ['pill', 'pill--person', p.id === mine && 'is-chosen'],
        'aria-pressed': String(p.id === mine),
        'data-focus-key': `me-${p.id}`,
        onclick: () => { setMyId(p.id); Object.assign(wid, { info: null, script: null }); refreshPush(); ctx.rerender(); },
      }, avatar(p, { size: 'sm' }), p.name))),
    ),
    appIconChoice(ctx),
    state.authEnabled && h('div', { class: 'choice' },
      h('button', {
        type: 'button', class: 'btn',
        onclick: () => { if (confirm('Dieses Gerät wirklich abmelden?')) logout(); },
      }, iconLabel('tuer', 'Abmelden')),
    ),
  );
}

// App-Icon fürs iPhone (Original oder „Nacht“) – gilt nur für dieses Gerät, siehe js/appicon.js
function appIconChoice(ctx) {
  const current = appIcon();
  const standalone = isStandalone();
  return h('fieldset', { class: 'choice' },
    h('legend', { class: 'choice__legend' }, 'App-Icon'),
    h('div', { class: 'icon-choice' }, APP_ICONS.map((i) => h('button', {
      type: 'button', class: ['icon-choice__item', i.id === current && 'is-chosen'], 'aria-pressed': String(i.id === current),
      'data-focus-key': `app-icon-${i.id}`, disabled: standalone,
      onclick: () => { setAppIcon(i.id); ctx.rerender(); showToast(`Icon „${i.label}“ gewählt – jetzt neu zum Home-Bildschirm hinzufügen`); },
    }, h('img', { src: iconUrl(i.id), alt: '', class: 'icon-choice__img' }), h('span', {}, i.label)))),
    standalone
      ? h('p', { class: 'settings__sub' }, 'Zum Ändern die App in Safari öffnen (nicht über das Symbol) und hier unter „Mehr → Dieses Gerät“ das Icon aussuchen.')
      : h('ol', { class: 'steps icon-choice__steps' },
        h('li', {}, 'Oben das Icon antippen.'),
        h('li', {}, 'Das alte App-Symbol auf dem Home-Bildschirm lange drücken → „App entfernen“.'),
        h('li', {}, 'Hier in Safari unten auf „Teilen“ → „Zum Home-Bildschirm“ → „Hinzufügen“.'),
        h('li', {}, 'Die App über das neue Symbol öffnen, anmelden und unter „Mehr“ die Benachrichtigungen wieder einschalten.'),
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
