# Wie passe ich die App an?

Kurzüberblick, wo was steht:

| Ich will … | Datei |
|---|---|
| Farben, Schrift, Abstände, Rundungen ändern | `public/css/tokens.css` |
| Dunkelmodus-Farben ändern | `public/css/tokens.css` (unterer Block) |
| Deko ändern oder abschalten (Papier, Tape, Schieflage, Notizblock) | `public/css/decor.css` |
| Schriften austauschen | `public/fonts/` und `public/css/fonts.css` |
| Szenen (Haus mit Katze, Tee, Haustür, Fensterbank, Wellenlinie) | `public/img/*.svg` (erzeugt von `scripts/make-art.py`) |
| Gezeichnete Symbole (Kategorien, Navigation, Knöpfe) | `public/js/ui/art.js` |
| App-Icon | `public/icons/icon.svg`, PNGs mit `node scripts/make-icons.cjs` |
| Layout für Handy, Tablet oder PC ändern, Breakpoints | `public/css/layout.css` |
| Aussehen von Karten, Chips, Buttons ändern | `public/css/components.css` |
| Abfrage-Intervall, Startseite, PC-Nebeneinander ändern | `public/js/config.js` |
| Texte und Aufbau einer Ansicht ändern | `public/js/views/liste.js`, `vorrat.js` |
| Navigation ändern (Reihenfolge, neue Seite) | `public/js/views/index.js` |
| Neues Datenfeld oder neue Tabelle anlegen | `server/migrations.js` und `server/modules/*.js` |
| Port, Datenordner ändern | `docker-compose.yml` |

Nach Änderungen auf dem Server ausführen:

```bash
docker compose up -d --build
```

Im Browser genügt dann ein Neuladen. Am PC kannst du auch ohne Docker testen: `npm run dev` starten und `http://localhost:8080` öffnen.

---

## 1. Design ändern

Das aktuelle Thema heißt **„Küchen-Skizzenbuch“**. Es besteht aus drei Ebenen:

1. **`css/tokens.css`**: alle Werte wie Farben, Schriften, Abstände, Rundungen, Schatten und Schieflage. Die anderen CSS-Dateien verwenden nur diese Variablen.
2. **`css/components.css`**: die Form der Bausteine, also Karten, Chips, Buttons, Liste und Haftnotiz.
3. **`css/decor.css`**: reine Kunst. Dazu gehören Papierkörnung, Aquarellflecken, Washi-Tape, schiefe Karten und der Notizblock mit Lochung. Entfernst du die Zeile mit `decor.css` aus `index.html`, wird die App sofort schlichter.

Häufige Änderungen in `tokens.css`:

```css
--color-accent:  #5d7d4c;   /* Salbeigrün -> z. B. #3b6ea5 für Blau */
--color-missing: #c8553d;   /* Terrakotta = "fehlt" */
--tone-1 … --tone-6         /* Pastellfarben der Kategorien (reihum vergeben) */
--tone-strength: 42%;       /* wie stark die Karten eingefärbt sind */
--tilt: 0.5deg;             /* Schieflage der Karten, 0deg = gerade */
--radius-card / --radius-chip / --radius-blob   /* "handgemachte" ungleichmäßige Rundungen */
--font-heading: "Fraunces"  /* Überschriften */
--font-body:    "Nunito"    /* Fließtext, Chips */
--font-hand:    "Caveat"    /* Handschrift: Untertitel, Einkaufsliste, Haftnotiz */
--texture-grain: url(...)   /* Papierkörnung; "none" = glattes Papier */
```

- **Dunkelmodus („Abends bei Kerzenlicht“):** Der Block `@media (prefers-color-scheme: dark)` überschreibt die Farben. Er schaltet automatisch nach der Systemeinstellung des Geräts um.
- **Andere Schrift:** Die `.woff2`-Datei nach `public/fonts/` legen, in `css/fonts.css` mit `@font-face` eintragen und in `tokens.css` verwenden. Kostenlose Schriften findest du z. B. bei Google Fonts oder fontsource.org (auf die Lizenz OFL achten). Schriften aus dem Internet zu laden, blockiert die Sicherheitsrichtlinie absichtlich. Das sorgt auch dafür, dass die App ohne Internet läuft.
- **Illustrationen:** Das sind einfache SVG-Dateien in `public/img/`, die du mit jedem Vektorprogramm (z. B. Inkscape oder Figma) austauschen kannst. Die Wellenlinie unter den Titeln wird als Maske benutzt, ihre Farbe kommt aus `--color-highlight`.
- **Kategorie-Farben:** Jede Kategorie bekommt anhand ihrer Nummer einen der Töne. Für mehr Töne `--tone-7` in `tokens.css` anlegen, dazu eine Zeile in `decor.css` und `toneCount` in `js/config.js` anpassen.
- **Symbole statt Emojis:** Alle kleinen Zeichnungen stehen in `public/js/ui/art.js` (Tintenlinien `ink`, Aquarell-Klecks `wash`, Punkte `dots`, je 48×48). Neues Symbol = neuer Eintrag dort; mit `pick: true` erscheint es in der Auswahl für neue Kategorien. Die Navigation nutzt das Feld `icon` in `public/js/views/liste.js` und `vorrat.js`.
- **Szenen:** `scripts/make-art.py` baut Katze, Pflanzen, Haus usw. aus kleinen Bausteinen zusammen und schreibt die SVGs nach `public/img/` (`python3 scripts/make-art.py public/img`). Hell/Dunkel und die Animationen (Dampf, Rauch, wiegende Pflanzen) stehen im `<style>` oben in jeder Datei.
- **Spruch in der Seitenleiste:** in `public/index.html` („Alles da, was wir lieben ♡“).
- **Layout:** Die Breakpoints sind oben in `layout.css` erklärt (Handy < 700px, Tablet, PC ≥ 1100px).
- **Nebeneinander am PC:** In `js/config.js` steuert `split: { main: 'vorrat', aside: 'liste' }`, welche Ansichten nebeneinander erscheinen. Mit `split: null` gibt es immer nur eine Ansicht.

---

## 2. Kategorien

- **In der App:** Im Vorrat ganz unten auf „＋ Neue Kategorie“ tippen. Eine **leere** Kategorie löschst du über „Bearbeiten“ und dann das 🗑-Symbol.
- **Per API** (z. B. zum Umbenennen oder Bild ändern):
  ```bash
  curl -X PATCH -H "Content-Type: application/json" -d '{"icon":"karotte"}' http://haushalt.fritz.box:8080/api/categories/1
  ```
- **Startdaten:** `startdaten.json` wird nur beim allerersten Start gelesen. Spätere Änderungen an der Datei wirken nur nach einem Neuanfang (siehe INSTALLATION.md).

---

## 3. Neues Feld ergänzen (Beispiel: Geschäft)

Mengen (`quantity`), Einheit (`unit`) und Notiz (`note`) sind **schon vorbereitet**. Sie stehen in der Datenbank und in der API, und die Einkaufsliste zeigt sie bereits an, sobald sie gefüllt sind. Ein komplett neues Feld geht in drei Schritten:

**a) Datenbank:** in `server/migrations.js` einen **neuen** Eintrag ans Ende der Liste setzen. Bestehende Einträge nie ändern.

```js
  `ALTER TABLE items ADD COLUMN store TEXT;`,
```

**b) API:** in `server/modules/items.js` eine Zeile bei `fields` ergänzen.

```js
  store: { col: 'store', type: 'text', max: 40 },
```

Damit kann die API `store` lesen und schreiben und prüft die Eingabe. Mögliche Typen: `text`, `int`, `number`, `bool`, `json`. Mögliche Optionen: `required`, `max`, `min`, `default`, `readonly`, `multiline`, `ref: 'tabelle'`.

**c) Anzeige:** in der Ansicht verwenden, z. B. in `public/js/views/liste.js` in `checkRow()`:

```js
  const detail = [amount, item.store && `🏪 ${item.store}`, item.note].filter(Boolean).join(' · ');
```

Soll das Feld auch beim „Rückgängig“ nach dem Löschen erhalten bleiben, trägst du es in `restoreItem()` in `public/js/store.js` ein.

---

## 4. Neuen Bereich ergänzen (Beispiel: Aufgaben)

Ein Bereich besteht aus **einer Tabelle, einem Server-Modul und einer Ansicht**. Er erscheint automatisch in `/api/state`, in der Navigation und unter `/#/aufgaben`, ist also auch per NFC-Sticker erreichbar.

**a) Tabelle:** neuer Eintrag am Ende von `server/migrations.js`

```js
  `
  CREATE TABLE tasks (
    id         INTEGER PRIMARY KEY,
    title      TEXT    NOT NULL,
    done       INTEGER NOT NULL DEFAULT 0,
    note       TEXT,
    created_at TEXT    NOT NULL,
    updated_at TEXT    NOT NULL
  );
  `,
```

**b) Server-Modul:** neue Datei `server/modules/tasks.js`

```js
import { registerCrud } from '../resource.js';

export default {
  name: 'tasks',   // Name in /api/state
  inState: true,
  register(ctx) {
    return registerCrud(ctx, {
      path: '/api/tasks',
      table: 'tasks',
      orderBy: 'done, id',
      fields: {
        title: { col: 'title', type: 'text', required: true, max: 120 },
        done:  { col: 'done',  type: 'bool', default: 0 },
        note:  { col: 'note',  type: 'text', max: 1000, multiline: true },
      },
    });
  },
};
```

… und in `server/modules/index.js` eintragen:

```js
import tasks from './tasks.js';
export const MODULES = [categories, items, tasks];
```

Damit gibt es `GET/POST/PATCH/DELETE /api/tasks`.

**c) Startwert im Frontend:** in `public/js/store.js` bei `state` die Zeile `tasks: [],` ergänzen.

**d) Ansicht:** neue Datei `public/js/views/aufgaben.js`

```js
import { h } from '../util.js';
import { viewHeader, emptyState, loading } from '../ui/components.js';
import { api } from '../api.js';
import { refresh } from '../store.js';

let draft = '';

export default {
  id: 'aufgaben',            // -> /#/aufgaben
  label: 'Aufgaben',
  icon: 'haken',   // Symbolname aus js/ui/art.js
  badge: (state) => state.tasks.filter((t) => !t.done).length,

  render(state, ctx) {
    if (!state.loaded) return loading();
    const add = async (e) => {
      e.preventDefault();
      if (!draft.trim()) return;
      await api.create('tasks', { title: draft });
      draft = '';
      await refresh();
    };
    return [
      viewHeader({ id: 'title-aufgaben', title: 'Aufgaben' }),
      h('form', { class: 'add-form', onsubmit: add },
        h('input', { class: 'input', placeholder: 'Neue Aufgabe …', 'data-focus-key': 'task-new',
          value: draft, oninput: (e) => { draft = e.target.value; } }),
        h('button', { class: 'btn btn--primary', type: 'submit' }, 'Hinzufügen')),
      state.tasks.length === 0
        ? emptyState({ symbol: 'blatt', title: 'Nichts zu tun' })
        : h('section', { class: 'card' }, h('ul', { class: 'check-list' },
            state.tasks.map((t) => h('li', {},
              h('button', {
                type: 'button',
                class: ['check-row', t.done && 'is-checked'],
                onclick: async () => { await api.update('tasks', t.id, { done: !t.done }); refresh(); },
              }, h('span', { class: 'check-row__box' }), h('span', {}, t.title)))))),
    ];
  },
};
```

… und in `public/js/views/index.js` eintragen:

```js
import aufgaben from './aufgaben.js';
export const VIEWS = [liste, vorrat, aufgaben];
```

Fertig. Für eine Pinnwand mit Infos (WLAN-Passwort für Gäste, Müllabfuhr, Notizen …) geht es genauso, z. B. mit einer Tabelle `notes` mit den Spalten `title` und `text`.

> Tipp: Für saubere „sofort sichtbar“-Effekte schreibst du die Aktionen wie bei den Artikeln in `store.js`. Dort zeigt `mutate()` die Änderung sofort an und meldet Fehler.

---

## 5. Wichtige Bausteine im Frontend

- `h(tag, props, ...kinder)` in `js/util.js` erzeugt HTML-Elemente. Texte werden dabei **immer sicher als Text** eingefügt, ohne XSS-Risiko. Bitte kein `innerHTML` mit Benutzertexten verwenden.
- `data-focus-key="…"` an Eingabefeldern und Buttons sorgt dafür, dass der Fokus beim automatischen Neuzeichnen erhalten bleibt.
- `showToast(text, { actionLabel, onAction })` in `js/ui/toast.js` zeigt einen Hinweis mit „Rückgängig“.
- `viewHeader`, `categoryHeader`, `emptyState` in `js/ui/components.js` sind wiederverwendbare Bausteine.

## 6. Ideen für später

- **Passwortschutz** ist schon eingebaut (`server/auth.js`): Er ist aktiv, sobald `HAUSHALT_PASSWORT` gesetzt ist. Neue API-Pfade sind automatisch geschützt. Nur was in `PUBLIC_API` steht, ist ohne Anmeldung erreichbar.
- **Zu Hause mit Pi und trotzdem von unterwegs:** WireGuard-VPN der FritzBox (Internet → Freigaben → VPN (WireGuard)). Damit ist keine Portfreigabe für die App nötig.
- **Rezepte und Wochenplan:** Tabellen `recipes` (mit `json`-Feld für Zutaten) und `meals` (Datum und Rezept-ID). Aus fehlenden Zutaten lassen sich dann direkt Einträge für die Einkaufsliste erzeugen.
- **Suche im Vorrat**, **Artikel umbenennen** oder **verschieben** (per `PATCH` mit `name` bzw. `categoryId`, die API kann das schon).
