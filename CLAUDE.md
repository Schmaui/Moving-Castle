# kait & schmauiis moving castle – Übergabe für neue Sessions

Haushalts-Web-App (Vorrat + Einkaufsliste + Fotos) für zwei Personen. Sprache in App, Doku
und Kommunikation: **Deutsch**. Die Nutzer sind **Einsteiger**: Befehle immer einzeln in
eigenen Code-Blöcken, Schritt für Schritt erklären, nach Screenshots fragen.

## Technik (Kurzfassung – Details in README.md und docs/ANPASSEN.md)
- Node.js ≥ 22.13 ohne npm-Abhängigkeiten, eingebautes `node:sqlite`. Start: `npm start`, Tests: `npm test`.
- Frontend: Vanilla JS (ES-Module), kein Build. Design-Variablen in `public/css/tokens.css`.
- Module (Server): `server/modules/*` (people, categories, items, photos, settings, tasks, recipes, meals, wishes, links, notes, folders, docs). Ansichten: `public/js/views/*`.
- Migrationen: `server/migrations.js` – nur NEUE Einträge anhängen, alte nie ändern.
- Gezeichnete Symbole statt Emojis: `public/js/ui/art.js`. Szenen-SVGs: `scripts/make-art.py`.
- Strenge CSP (keine Inline-Styles/-Scripts), alle Ausgaben über `h()` (XSS-sicher).
- Screenshots/Checks: `scripts/screenshots.cjs` (braucht frischen Server auf :8080 mit leerer DB).

## Betrieb (online)
- Hetzner Cloud, Server „moving-castle“ (CAX11, Ubuntu 24.04, Falkenstein), IP 2.31.137.100.
- Adresse: https://kait-schmauiis-castle.duckdns.org (DuckDNS → Server-IP), HTTPS über Caddy.
- `docker-compose.online.yml` + `Caddyfile`; Passwort/Domain in `/opt/haushalt/.env` auf dem Server
  (nie ins Repo!). Anmeldung: gemeinsames Haushalts-Passwort (`server/auth.js`).
- **Auto-Deploy:** Der Server holt alle 5 Min. `main` von GitHub (`scripts/auto-update.sh`, Cron).
  → **Alles, was auf `main` gepusht wird, ist kurz danach live.**
- Aus der Cloud-Session ist der Server NICHT erreichbar (weder SSH noch HTTPS). Prüfen können
  nur die Nutzer. Für Server-Befehle: Nutzer per `ssh root@2.31.137.100` anleiten.
- Tägliches Backup 3:30 Uhr nach `/opt/haushalt/data/backups/` (DB + Fotos).

## Arbeitsweise (wichtig)
- Neue Features/Designs auf einem **eigenen Branch** bauen, Vorschau-Screenshots (Handy + PC,
  hell + dunkel) schicken, erst nach „passt“ nach `main` mergen.
- Vor dem Mergen: `npm test` und `scripts/screenshots.cjs` müssen grün sein.

## Stand / offen (zuletzt aktualisiert: 7.11.2026, Ende der Session)
- `main` (live): Zeichnungs-Design, Login, Auto-Update **und seit 7.11.2026 das Kühlschrank-Design**
  (vom Branch `design-kuehlschrank` gemergt):
  - Kühlschranktür-Design in Mauve, schräge Zettel mit Washi-Tape.
  - Polaroid-Fotos zwischen den Zetteln (Upload, im Browser verkleinert, nur mit Login sichtbar).
  - Einstellungen-Seite (#/einstellungen, Nav „Mehr“): Fotos verwalten, Türfarbe, Foto-Häufigkeit,
    Abmelden – gemeinsam für alle Geräte (`server/modules/settings.js`).
- **Seit 7.11.2026 ebenfalls live** (vom Branch `aufgaben-profile` gemergt):
  - Profile „Wir zwei“ (Kait, Schmaui): Name, gezeichnete Figur oder eigenes Foto, Farbe
    (`server/modules/people.js`). Jedes Gerät fragt einmal „Wer bist du?“ (localStorage,
    `public/js/me.js`) und schickt die Person als Header `X-Person` mit.
  - Wer-hat-was: Einkaufsliste (wer draufgesetzt, „Zuletzt gekauft“ mit „nochmal“), Fotos (wer aufgehängt).
  - Aufgaben (#/aufgaben, `server/modules/tasks.js`): fällig am, wer macht’s, wiederholen
    (täglich/wöchentlich/2 Wochen/monatlich), Notiz, Erledigt-Verlauf; „Heute dran“-Zettel im Vorrat.
- **Seit 7.11.2026 live** (vom Branch `rezepte` gemergt) – Nav-Knopf „Kochen“ (#/kochen):
  - Wochenplan nur Abendessen, pro Abend 2 Vorschläge („Das gibt’s“ wählt einen), „Gekocht“ zieht
    nach Bestätigung Mengen vom Vorrat ab. Reiter Woche / Rezepte / Lieblinge (Herz).
  - Rezepte: per Link holen (`server/recipe-import.js`, schema.org JSON-LD, SSRF-Schutz) oder selbst
    schreiben; Zeit, Schlagwörter, Notizen. Kein Foto, kein Portionen-Umrechnen (so gewünscht).
  - Abgleich mit Vorrat in `public/js/recipes.js` (Parser, Synonyme, Zuordnung merken = `links`).
    „Fehlendes einkaufen“ pro Rezept: Vorrat -> Einkaufsliste, alles andere -> **Wunschzettel**
    (eigener Zettel unter der Einkaufsliste, `wishes`).
  - Vorrat = was immer da sein soll. Mengen optional (Menge, Mindestmenge, Einheit; im Vorrat unter
    „Bearbeiten“ -> Artikel antippen). Unter Mindestmenge -> fehlt automatisch; beim Abhaken auf
    der Liste wird auf die Mindestmenge aufgefüllt (+/- zum Erhöhen).
  - Migration 7 ergänzt Grundzutaten: Kategorien „Backen & Süßes“ (+Ahornsirup verschoben) und
    „Soßen“ (+Mayo, Ketchup, Salsa verschoben), Olivenöl -> Gewürze, Reis -> Nudeln & Co.
  - Link-Import konnte nur mit Testseiten geprüft werden (Rezeptseiten aus der Cloud-Session
    gesperrt) – bei Problemen Nutzer nach Link + Fehlermeldung fragen.
- **Alles oben ist live und von den Nutzern getestet („funktioniert“), auch der Link-Import.**
- **Seit 7.11.2026 live: Infos-Pinnwand** (#/pinnwand, vom Branch `claude/vigilant-noether-1h6c6p` gemergt,
  Nutzer: „passt“ nach Screenshots).
  Entscheidungen der Nutzer (7.11.2026, per Klick-Fragen):
  - Inhalte: WLAN für Gäste (QR), wichtige Nummern, Verträge & Dokumente. KEINE Zählerstände, KEIN Müll.
  - Aufbau: freie Zettel + Spezial-Zettel; an der Pinnwand nach Art gruppiert (WLAN, Nummern, Verträge &
    Dokumente, Zettel).
  - Ort: eigener Knopf „Pinnwand“ in der Leiste vor „Mehr“ (jetzt 6 Knöpfe, Schrift am Handy kleiner).
  - Geheimes (WLAN-Passwort, PIN): verdeckt, antippen zeigt (20 s), Kopieren-Knopf.
  - Nummern: als Gruppen (mehrere Nummern-Zettel), antippen ruft an; „Notfälle“ (112, 110, 116117,
    116116) per Migration 8 vorausgefüllt.
  - Verträge: nur Name + Notiz + Dateien (PDF hochladen oder Foto von Papier) – keine Kosten/Fristen.
  - QR: klein auf dem Zettel, antippen = groß zum Scannen.
- **Seit 7.11.2026 live: Umbau Pinnwand** (Wunsch nach Test, Branch `claude/vigilant-noether-1h6c6p`,
  Nutzer: „passt“ nach Screenshots). Entscheidungen (Klick-Fragen):
  - #/pinnwand = Übersicht mit 4 Kacheln: WLAN, Nummern, Notizen, Ordner.
  - WLAN/Nummern/Notizen öffnen je ein **Korkbrett mit Holzrahmen**, Zettel mit Pinnadeln (statt Tape).
    Routen `#/pinnwand/wlan|nummern|notizen`. Notizen = kind `zettel` (Geheimes verdeckt bleibt).
  - **Ordner** (`#/pinnwand/ordner`, `…/ordner/:id`): Unterordner selbst anlegen, nur eine Ebene;
    Start-Ordner „Verträge“, „Wohnung“. Datei = PDF/Foto + Name (aus Dateiname vorausgefüllt) + Notiz;
    verschieben, umbenennen, löschen; Suche über Name + Notiz aller Dateien. Volle Ordner nicht löschbar.
  - Dokument-Zettel und Dateien an Zetteln entfallen (Migration 9 löscht die Test-Einträge, Server räumt
    `data/dokumente/` beim Start weg – Nutzer: „nichts Wichtiges“).
  Technik: `server/modules/notes.js`, `folders.js`, `docs.js` (Dateien in `data/ordner/`, im Backup),
  QR-Erzeuger ohne Pakete `public/js/ui/qr.js` (mit zxing geprüft), Ansicht `public/js/views/pinnwand.js`.
  Update-Pfad von Migration 8 → 9 mit alter DB getestet.
  Noch von den Nutzern am echten Gerät zu prüfen: PDF öffnen auf dem iPhone (öffnet neuen Tab – bei App vom
  Home-Bildschirm evtl. Anmeldung nötig?), QR mit echtem Handy scannen.
- **Küche + Haushalt (7.11.2026): gebaut, wartet auf „passt“** (Branch `claude/vigilant-noether-1h6c6p`,
  noch NICHT auf main). Entscheidungen (Klick-Fragen):
  - Leiste: Liste · Küche · Aufgaben · Pinnwand · Mehr (5 Knöpfe). „Küche“ = View `vorrat`
    (navLabel), Reiter oben Vorrat · Haushalt · Kochen (`kitchenTabs` in `ui/components.js`).
    Views `haushalt` und `kochen` haben `inNav: false`; `navAlso` lässt „Küche“ leuchten.
    Routen `#/vorrat`, `#/haushalt`, `#/kochen` bleiben (NFC!).
  - Kategorien haben `area` ('kueche' | 'haushalt', Migration 10). Haushalt = gleiche Ansicht wie
    Vorrat (`stockView` in `views/vorrat.js`), ohne Fotos/Heute-Zettel. Start-Kategorien: Bad &
    Körperpflege, Putzen & Wäsche, Haushalt & Sonstiges (auch in startdaten.json mit "bereich").
    Im Bearbeiten-Modus Knopf „→ Haushalt“/„→ Vorrat“ zum Verschieben einer Kategorie.
  - Einkaufsliste: erst Essen, darunter Abschnitt „Haushalt“. PC: links Vorrat ODER Haushalt
    (`CONFIG.split.main` ist jetzt eine Liste), rechts die Liste.
  Update-Pfad Migration 9 → 10 mit alter DB getestet.
- Ganz am Ende (Wunsch der Nutzer): automatische Sicherung auf den Mac der Nutzer. Plan: Skript
  `scripts/mac-backup-einrichten.sh` (SSH-Schlüssel einrichten, LaunchAgent täglich, `rsync` von
  `root@2.31.137.100:/opt/haushalt/data/backups/` nach `~/moving-castle-backup/` – nicht nach
  ~/Documents, das blockiert macOS für Hintergrundjobs). Nutzer starten es einmal im Terminal.
- Offen nebenbei: Backup einmal mit den Nutzern prüfen (per SSH, Schritt für Schritt);
  README.md und docs/ANPASSEN.md um Profile, Aufgaben, Kochen, Pinnwand ergänzen.
- **Als Nächstes** (Reihenfolge der Nutzer): Kalender, siehe unten.
- Danach (Reihenfolge der Nutzer): Kalender
  (Abo-Link für Apple-Kalender, ggf. iCloud-Kalender lesend anzeigen).
- Später: NFC-Sticker (Anleitung `docs/NFC.md`, URLs `…/#/liste` und `…/#/vorrat`),
- Hinweis: Bilder, die Nutzer im Chat schicken, kamen zuletzt teilweise leer an → ggf. nachfragen.
