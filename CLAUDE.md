# kait & schmauiis moving castle – Übergabe für neue Sessions

Haushalts-Web-App (Vorrat + Einkaufsliste + Fotos) für zwei Personen. Sprache in App, Doku
und Kommunikation: **Deutsch**. Die Nutzer sind **Einsteiger**: Befehle immer einzeln in
eigenen Code-Blöcken, Schritt für Schritt erklären, nach Screenshots fragen.

## Technik (Kurzfassung – Details in README.md und docs/ANPASSEN.md)
- Node.js ≥ 22.13 ohne npm-Abhängigkeiten, eingebautes `node:sqlite`. Start: `npm start`, Tests: `npm test`.
- Frontend: Vanilla JS (ES-Module), kein Build. Design-Variablen in `public/css/tokens.css`.
- Module (Server): `server/modules/*` (categories, items, photos, settings). Ansichten: `public/js/views/*`.
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

## Stand / offen (zuletzt aktualisiert: 7.11.2026)
- `main` (live): Zeichnungs-Design, Login, Auto-Update **und seit 7.11.2026 das Kühlschrank-Design**
  (vom Branch `design-kuehlschrank` gemergt):
  - Kühlschranktür-Design in Mauve, schräge Zettel mit Washi-Tape.
  - Polaroid-Fotos zwischen den Zetteln (Upload, im Browser verkleinert, nur mit Login sichtbar).
  - Einstellungen-Seite (#/einstellungen, Nav „Mehr“): Fotos verwalten, Türfarbe, Foto-Häufigkeit,
    Abmelden – gemeinsam für alle Geräte (`server/modules/settings.js`).
- Danach geplant: NFC-Sticker (Anleitung `docs/NFC.md`, URLs `…/#/liste` und `…/#/vorrat`),
  evtl. später Aufgaben/Infos/Rezepte (Beispiel in docs/ANPASSEN.md).
- Hinweis: Bilder, die Nutzer im Chat schicken, kamen zuletzt teilweise leer an → ggf. nachfragen.
