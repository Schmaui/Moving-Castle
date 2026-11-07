# kait & schmauiis moving castle – Übergabe für neue Sessions

Haushalts-Web-App (Vorrat + Einkaufsliste + Fotos) für zwei Personen. Sprache in App, Doku
und Kommunikation: **Deutsch**. Die Nutzer sind **Einsteiger**: Befehle immer einzeln in
eigenen Code-Blöcken, Schritt für Schritt erklären, nach Screenshots fragen.

## Technik (Kurzfassung – Details in README.md und docs/ANPASSEN.md)
- Node.js ≥ 22.13 ohne npm-Abhängigkeiten, eingebautes `node:sqlite`. Start: `npm start`, Tests: `npm test`.
- Frontend: Vanilla JS (ES-Module), kein Build. Design-Variablen in `public/css/tokens.css`.
- Module (Server): `server/modules/*` (people, categories, items, photos, settings, tasks, recipes, meals, wishes, links, notes, folders, docs, calendar). Ansichten: `public/js/views/*`.
- Migrationen: `server/migrations.js` – nur NEUE Einträge anhängen, alte nie ändern.
- Gezeichnete Symbole statt Emojis: `public/js/ui/art.js`. Szenen-SVGs: `scripts/make-art.py`.
- Strenge CSP (keine Inline-Styles/-Scripts), alle Ausgaben über `h()` (XSS-sicher).
- Screenshots/Checks: `scripts/screenshots.cjs` (braucht frischen Server auf :8080 mit leerer DB und
  `IMPORT_ALLOW_PRIVATE=1`, weil der Test-Kalender von localhost kommt).

## Betrieb (online)
- Hetzner Cloud, Server „moving-castle“ (CAX11, Ubuntu 24.04, Falkenstein), IP 2.31.137.100.
- Adresse: https://kait-schmauiis-castle.duckdns.org (DuckDNS → Server-IP), HTTPS über Caddy.
- `docker-compose.online.yml` + `Caddyfile`; Passwort/Domain in `/opt/haushalt/.env` auf dem Server
  (nie ins Repo!). Anmeldung: gemeinsames Haushalts-Passwort (`server/auth.js`).
- **Auto-Deploy:** Der Server holt alle 5 Min. `main` von GitHub (`scripts/auto-update.sh`, Cron).
  → **Alles, was auf `main` gepusht wird, ist kurz danach live.**
- Aus der Cloud-Session ist der Server NICHT erreichbar (weder SSH noch HTTPS). Prüfen können
  nur die Nutzer. Für Server-Befehle: Nutzer per `ssh root@2.31.137.100` anleiten.
- Tägliches Backup 3:30 Uhr nach `/opt/haushalt/data/backups/` (DB + `fotos/` + `ordner/`), Cron
  `/etc/cron.d/haushalt-backup`, Log `/var/log/haushalt-backup.log`. Am 7.11.2026 mit den Nutzern per
  SSH geprüft: Cron korrekt, erste Sicherung von Hand erfolgreich (vorher lief noch keine, Server war neu).

## Arbeitsweise (wichtig)
- **Seit 7.11.2026 (Wunsch der Nutzer):** Fertige Features NICHT mehr erst als Vorschau zeigen, sondern
  nach grünen Tests direkt nach `main` mergen und pushen (= live). Die Nutzer testen dann live und
  melden Verbesserungen. Weiterhin auf eigenem Branch entwickeln und vorher per Klick-Fragen klären.
- Vor dem Mergen: `npm test` und `scripts/screenshots.cjs` müssen grün sein (lokales `main` kann veraltet
  sein – für den Update-Test `origin/main` nehmen).
- Die Nutzer wollen vor jedem Feature **ausführlich per Klick-Fragen (AskUserQuestion)** gefragt werden
  (gern 2 Runden à 4 Fragen, mit Empfehlung als erste Option).
- Datenbank-Änderungen: neue Migration anhängen; Update-Pfad mit alter DB testen (alte `main` per
  `git worktree` starten, Daten anlegen, dann neuen Stand auf derselben DB starten).
- Fallen, in die ich schon getappt bin: `render()` darf nur EINE Ebene Arrays zurückgeben (app.js macht
  `.flat()` einmal) – verschachtelte Listen in ein `h('div')` packen. `data-focus-key` muss über ALLE
  Ansichten eindeutig sein (alle Ansichten werden immer gerendert, nur versteckt).

## Stand (zuletzt aktualisiert: 7.11.2026, Filmabend) – alles live auf `main`
Leiste unten (5 Knöpfe): **Liste · Küche · Planer · Pinnwand · Mehr**. Views in `public/js/views/index.js`;
Unterbereiche haben `inNav: false`, der Hauptknopf leuchtet über `navAlso`.

- **Liste** (#/liste): fehlende Artikel, erst Essen, darunter Abschnitt „Haushalt“; Wunschzettel,
  „Zuletzt gekauft“; wer hat was draufgesetzt. PC: Liste rechts neben Vorrat/Haushalt (`CONFIG.split`).
- **Küche** = View `vorrat`, Reiter (`kitchenTabs`): **Vorrat** (#/vorrat, Essen, Kühlschrank-Design mit
  Polaroids, „Heute dran“/„Heute gibt’s“-Zettel) · **Haushalt** (#/haushalt, Bad/Putzen/Sonstiges) ·
  **Kochen** (#/kochen: Wochenplan Abendessen, Rezepte per Link oder selbst, Lieblinge, Abgleich mit Vorrat).
  Kategorien haben `area` 'kueche' | 'haushalt' (Migration 10), im Bearbeiten-Modus verschiebbar.
  Mengen optional (Menge/Mindestmenge/Einheit; unter Mindestmenge -> fehlt automatisch).
- **Planer** = View `kalender`, Reiter (`plannerTabs`): **Kalender** (#/kalender Woche, #/kalender/monat)
  · **Aufgaben** (#/aufgaben: fällig, wer, wiederholen, Verlauf). Badge = heutige Aufgaben.
  Kalender: je Person ein Apple-„Öffentlicher Kalender“-Link (geheim, nur auf dem Server, Tabelle
  `calendar_feeds`), zusammen als EIN Kalender, Farbe = Profil-Farbe + Profilbild, doppelte Termine einmal.
  Nur lesen. Server holt alle 15 Min. (`server/modules/calendar.js`, Leser `server/ical.js`).
  **Noch nicht mit echten Links verbunden** – beim ersten Verbinden begleiten (iCloud aus der Cloud-Session
  nicht testbar), bei Fehler nach Meldung/Screenshot fragen.
- **Pinnwand** (#/pinnwand): 4 Kacheln. WLAN / Nummern / Notizen je auf Korkbrett (Pinnadeln);
  WLAN mit QR (`public/js/ui/qr.js`), Geheimes verdeckt (antippen zeigt 20 s); Nummern-Gruppen, antippen
  ruft an, „Notfälle“ vorausgefüllt. **Ordner** (#/pinnwand/ordner): Unterordner (eine Ebene, Start
  „Verträge“, „Wohnung“), PDF/Foto + Name + Notiz, verschieben, Suche. Dateien in `data/ordner/`.
  Noch am echten iPhone zu prüfen: PDF öffnen (neuer Tab, bei Home-Bildschirm-App evtl. Anmeldung?).
  **Filmabend** (#/pinnwand/filmabend, 5. Kachel, `public/js/views/filmabend.js`, Server `movies.js`,
  Migration 12): Kino-Look (Vorhang, Kinokarten), Film/Serie, „Wo läuft's?“ (Netflix, Prime Video,
  Disney+, HBO, Kino, Sonstiges), „Wer will's sehen?“ (Beide wollen ♡), Zufallsknopf „Was gucken wir
  heute?“ (was beide wollen, kommt doppelt so oft), „Gesehen“ mit 1–5 Popcorn je Person, Schnitt ≥ 4
  = „Unsere Lieblinge“. Karten hängen direkt an der Tür (Nutzer mochten den dunklen „KI-blocky“-Kasten
  NICHT – keine großen dunklen Container mehr), oben nur ein schmales Vorhang-Band.
- **Küche zuklappbar** (Vorrat + Haushalt): Zettel zeigen zugeklappt nur Überschrift + was fehlt („alles da“),
  Überschrift antippen = auf/zu, „Alle auf/zu“ oben; pro Gerät in localStorage (`haushalt_offene_zettel`).
  Bearbeiten-Modus und „+“ klappen automatisch auf. Nutzer fanden die App vorher „zu voll“ – das half.
- **Galerie** (Mehr): alle Fotos als Raster (Unterschrift ändern, löschen). An der Tür nur eine zufällige
  Auswahl (`doorPhotos()`: Handy 3, PC 5, pro App-Start neu gemischt, frisch hochgeladene immer dabei).
- **Fotos an der Küchentür** (Vorrat): wie Magnete verstreut (`.fridge-board` + `.photo-layer`,
  `scatterPhotos()` in `ui/photos.js`, von app.js nach jedem Zeichnen, nach Schriften und bei Größenänderung).
  Misst die Zettel, tastet Kanten ab, dann freie Lücken, NIE über Artikel/Knöpfe/Titel (Selbsttest prüft das).
  Ergebnis wird gemerkt (Signatur aus Maßen), Position per CSSOM (`el.style.left`, CSP-erlaubt).
  Einstellung „Fotos an der Tür“: an/aus (`photoEvery` 0 = aus). Foto antippen: wackelt, dann groß.
- **Animationen** (`public/js/ui/fx.js`, Web Animations API): Tür schwingt beim Start auf, Seiten rutschen
  beim Wechsel wie Umblättern herein (Richtung nach Reihenfolge der Leiste bzw. Unterseite = von rechts),
  Abhaken in der Liste fliegt in den Korb, Aufgabe erledigt -> Herzen, neue Zettel/Fotos/Kinokarten
  kleben sich an (`enter(key, createdAt)`: nur < 90 s alt, und erst wenn sie zum ersten Mal SICHTBAR sind),
  Zufall: Würfel rollt + Vorhang geht auf,
  Popcorn ploppt. WICHTIG: app.js zeichnet alles neu -> keine CSS-Einblend-Animationen an neu gezeichneten
  Elementen (laufen sonst bei jedem Abgleich neu), stattdessen `play()`/`enter()` aus fx.js.
  „Bewegung reduzieren“ schaltet alles ab; screenshots.cjs läuft deshalb mit reducedMotion und prüft
  Animationen in einem eigenen Abschnitt.
- **Mehr** (#/einstellungen): Wir zwei (Profile: Name, Figur/Foto, Farbe), Fotos, Kalender verbinden,
  Türfarbe, dieses Gerät (wer bin ich), Abmelden.
- Profile: jedes Gerät fragt einmal „Wer bist du?“ und schickt `X-Person` mit (wer-hat-was).
- **Backup** am 7.11.2026 mit den Nutzern geprüft (siehe „Betrieb“).
- Von den Nutzern getestet: alles bis einschließlich Küche + Haushalt („funktioniert alles“).

## Offen
- Filmabend, Animationen, verstreute Fotos, Zuklappen, Galerie: live, Feedback der Nutzer abwarten.
- Ausnahme von „direkt live“: Bei Geschmacksfragen (Aufräumen/Design) Vorher-Nachher-Bild schicken und
  auf „passt“ warten – so am 7.11. beim Zuklappen gemacht, kam gut an.
- **Nächste gewünschte Ideen** (Nutzer am 7.11. gewählt, vorher per Klick-Fragen klären):
  **Nachricht an die Tür** (handgeschriebene Nachricht als Magnet für den anderen),
  **Benachrichtigungen** (Web-Push, iPhone nur als Home-Bildschirm-App ab iOS 16.4; z. B. „X hat Milch auf
  die Liste gesetzt“, „Aufgabe heute“), **Wochen-Rückblick** (Sonntags-Zettel: erledigt, gekocht, geguckt).
  Nicht gewählt: Liste nach Laden sortiert, Wetter an der Tür.
- Ideen-Speicher (Nutzer interessiert, „für später“): **Gemeinsame Ausgaben** (wer hat was bezahlt,
  wer schuldet wem). Nicht gewählt: Ausflugs-/Date-Ideen, Geburtstage & Geschenke, Haltbarkeit im Vorrat,
  Serien-Fortschritt, Snacks auf Einkaufsliste, Filmabend planen, Poster automatisch (TMDB).
- Zurückgestellt (Nutzer: „erstmal egal“, NICHT von selbst wieder vorschlagen):
  - Automatische Sicherung auf den Mac (Plan: `scripts/mac-backup-einrichten.sh`, SSH-Schlüssel,
    LaunchAgent täglich, `rsync` von `root@2.31.137.100:/opt/haushalt/data/backups/` nach
    `~/moving-castle-backup/` – nicht ~/Documents, das blockiert macOS für Hintergrundjobs).
  - NFC-Sticker (Anleitung `docs/NFC.md`, URLs `…/#/liste` und `…/#/vorrat`).
- Nebenbei, wenn Zeit: README.md und docs/ANPASSEN.md um Profile, Aufgaben, Kochen, Pinnwand, Kalender
  ergänzen. Server hat 3 offene Ubuntu-Updates (`apt upgrade` irgendwann mit den Nutzern; KEIN
  `do-release-upgrade`).
- Hinweis: Bilder, die Nutzer im Chat schicken, kamen früher teilweise leer an → ggf. nachfragen
  (in der Session am 7.11. kamen Screenshots gut an).
