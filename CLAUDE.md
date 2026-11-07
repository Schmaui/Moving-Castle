# kait & schmauiis moving castle – Übergabe für neue Sessions

Haushalts-Web-App (Vorrat + Einkaufsliste + Fotos) für zwei Personen. Sprache in App, Doku
und Kommunikation: **Deutsch**. Die Nutzer sind **Einsteiger**: Befehle immer einzeln in
eigenen Code-Blöcken, Schritt für Schritt erklären, nach Screenshots fragen.

## Technik (Kurzfassung – Details in README.md und docs/ANPASSEN.md)
- Node.js ≥ 22.13 ohne npm-Abhängigkeiten, eingebautes `node:sqlite`. Start: `npm start`, Tests: `npm test`.
- Frontend: Vanilla JS (ES-Module), kein Build. Design-Variablen in `public/css/tokens.css`.
- Module (Server): `server/modules/*` (people, categories, items, photos, settings, tasks, recipes, meals, wishes, links). Ansichten: `public/js/views/*`.
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
- **Als Nächstes: Infos-Pinnwand.** Die Nutzer arbeiten gern mit Fragen zum Anklicken
  (AskUserQuestion) und wollen ausführlich gefragt werden. Noch zu klären (wurde vorbereitet,
  aber noch nicht beantwortet): welche Inhalte (WLAN-Gast mit QR-Code, wichtige Nummern zum
  Antippen, Zählerstände mit Verlauf, Müll & Verträge), Aufbau (freie Zettel + Spezial-Zettel vs.
  feste Bereiche), Ort (Vorschlag: „Mehr“ wird Übersicht mit Pinnwand + Einstellungen, Leiste
  bleibt bei 5 Knöpfen), Geheimes (Vorschlag: verdeckt, antippen zeigt/kopiert).
- Offen nebenbei: Backup einmal mit den Nutzern prüfen (per SSH, Schritt für Schritt);
  README.md und docs/ANPASSEN.md um Profile, Aufgaben, Kochen ergänzen.
- Danach (Reihenfolge der Nutzer): Kalender
  (Abo-Link für Apple-Kalender, ggf. iCloud-Kalender lesend anzeigen).
- Später: NFC-Sticker (Anleitung `docs/NFC.md`, URLs `…/#/liste` und `…/#/vorrat`),
- Hinweis: Bilder, die Nutzer im Chat schicken, kamen zuletzt teilweise leer an → ggf. nachfragen.
