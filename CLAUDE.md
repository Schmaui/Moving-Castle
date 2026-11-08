# kait & schmauiis moving castle – Übergabe für neue Sessions

Haushalts-Web-App (Vorrat + Einkaufsliste + Fotos) für zwei Personen. Sprache in App, Doku
und Kommunikation: **Deutsch**. Die Nutzer sind **Einsteiger**: Befehle immer einzeln in
eigenen Code-Blöcken, Schritt für Schritt erklären, nach Screenshots fragen.

## Technik (Kurzfassung – Details in README.md und docs/ANPASSEN.md)
- Node.js ≥ 22.13 ohne npm-Abhängigkeiten, eingebautes `node:sqlite`. Start: `npm start`, Tests: `npm test`.
- Frontend: Vanilla JS (ES-Module), kein Build. Design-Variablen in `public/css/tokens.css`.
- Module (Server): `server/modules/*` (people, categories, items, photos, settings, tasks, recipes, meals, wishes, links, notes, folders, docs, calendar, movies, messages, push, widget, prefs). Ansichten: `public/js/views/*`.
  Module melden Änderungen über `ctx.events` ('write', { table, before, after, actor }) aus `resource.js`.
- Migrationen: `server/migrations.js` – nur NEUE Einträge anhängen, alte nie ändern.
- Gezeichnete Symbole statt Emojis: `public/js/ui/art.js`. Szenen-SVGs: `scripts/make-art.py`.
- Strenge CSP (keine Inline-Styles/-Scripts), alle Ausgaben über `h()` (XSS-sicher).
- Screenshots/Checks: `scripts/screenshots.cjs` (braucht frischen Server auf :8080 mit leerer DB,
  `IMPORT_ALLOW_PRIVATE=1` (Test-Kalender von localhost) und `PUSH_ALLOW_LOCAL=1` (Test-Push-Dienst lokal)).

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
- **IMMER DIREKT LIVE (ausdrücklicher Wunsch der Nutzer, 7.11.2026):** Fertige Änderungen nach grünen
  Tests SOFORT nach `main` mergen und pushen (= live). NICHT vorher fragen „passt es so?“, KEINE
  Vorher-Nachher-Bilder zur Freigabe schicken und nicht auf „passt“ warten – auch nicht bei Design-/
  Geschmacksfragen. Danach kurz erklären, was neu ist, und ein paar Screenshots zeigen; die Nutzer testen
  live und melden Verbesserungen. Weiterhin auf eigenem Branch entwickeln und VOR dem Bauen per
  Klick-Fragen klären, was gewünscht ist.
- Vor dem Mergen: `npm test` und `scripts/screenshots.cjs` müssen grün sein (lokales `main` kann veraltet
  sein – für den Update-Test `origin/main` nehmen).
- Die Nutzer wollen vor jedem Feature **ausführlich per Klick-Fragen (AskUserQuestion)** gefragt werden
  (gern 2 Runden à 4 Fragen, mit Empfehlung als erste Option).
- Datenbank-Änderungen: neue Migration anhängen; Update-Pfad mit alter DB testen (alte `main` per
  `git worktree` starten, Daten anlegen, dann neuen Stand auf derselben DB starten).
- Fallen, in die ich schon getappt bin: Seite am Handy breiter als der Bildschirm (z. B. Grid ohne
  `minmax(0, 1fr)`) -> Playwright-Klicks scheitern rätselhaft („… intercepts pointer events“); selbsttest prüft
  „Mehr“ jetzt darauf. `render()` darf nur EINE Ebene Arrays zurückgeben (app.js macht
  `.flat()` einmal) – verschachtelte Listen in ein `h('div')` packen. `data-focus-key` muss über ALLE
  Ansichten eindeutig sein (alle Ansichten werden immer gerendert, nur versteckt).

## Stand (zuletzt aktualisiert: 8.11.2026, Ende der Session) – alles live auf `main`
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
- **Pinnwand** (#/pinnwand): 5 Kacheln (inkl. Filmabend). WLAN / Nummern / Notizen je auf Korkbrett (Pinnadeln);
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
  Überschrift antippen = auf/zu, „Alle auf/zu“ oben; pro Person gespeichert (`openNotes`, früher localStorage).
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
- **Nachricht an die Tür** (`public/js/ui/door.js`, Server `messages.js`, Migration 13, Tabelle `door_messages`):
  Beim App-Start ist die Kühlschranktür ZU. Hängt eine NEUE (noch nicht angeschaute) Nachricht für mich dran
  (jünger als 24 Std.), bleibt sie zu, bis man tippt; ohne Nachricht kurz „Hallo <Name> ♡“ + Datum, dann geht sie von selbst auf (ersetzt das
  alte `doorOpen()` aus fx.js). Nachricht = getippt (Handschrift-Schrift) und/oder mit dem Finger gemalt
  (Striche als JSON, Malfläche 400×300, `openPad()` als Overlay außerhalb der Ansichten, damit Neuzeichnen
  nicht stört), Zettelfarbe gelb/rosa/mint/blau. Geht immer an die andere Person, KEIN Lesestatus (Nutzer-
  Wunsch), nach 24 Std. weg (Server löscht beim Abruf, App blendet selbst aus). Geschrieben wird NUR unter
  „Mehr“ (oberster Abschnitt), dort auch „Hängt gerade an der Tür“ mit „Abnehmen“. Zurück in die App nach
  Hintergrund + neue Nachricht -> Tür wieder zu; neue Nachricht während man die App benutzt -> nur Hinweis mit
  „Ansehen“. Gesehene IDs pro Person (`seenMessages`, siehe unten). „Bewegung reduzieren“: ohne
  Nachricht gar keine Tür, mit Nachricht Tür ohne Animation.
- **Benachrichtigungen** (Web-Push, NUR iPhone als Home-Bildschirm-App ab iOS 16.4 – Nutzerwunsch, am Mac nur
  Hinweis): `server/webpush.js` (RFC 8291/8292 selbst mit node:crypto, keine Pakete; VAPID-Schlüssel in Tabelle
  `meta`), `server/modules/push.js` (Migration 14: `push_subscriptions` + `push_queue`; Einstellungen seit Migration 15
  pro PERSON in `person_prefs.push`, die alte Spalte `prefs` am Abo ist nur noch Rückfall),
  Client `public/js/push.js` + `public/sw.js` (Service Worker OHNE Cache). Arten: tuer (sofort), liste (vom
  anderen, gesammelt 3 Min. nach letzter Änderung, „Rückgängig“ nimmt raus), aufgaben + termine (eine
  Morgen-Nachricht zur eingestellten Zeit, bis 4 Std. danach, nur wenn etwas ansteht). Ruhezeit pro Person
  (wartet bis danach). Nur echte Push-Dienste erlaubt (Apple/Google/Mozilla/Microsoft). Aus der Cloud-Session
  nicht am echten iPhone testbar – Nutzer beim ersten Einschalten begleiten (Home-Bildschirm-App!).
- **Widget** (iPhone + Mac-Schreibtisch ab Sonoma über „iPhone-Widgets“): über die kostenlose App
  **Scriptable**. Skript `public/widget/moving-castle-widget.js` (App setzt Adresse + geheimen Schlüssel ein,
  „Skript kopieren“ unter Mehr → Widget). Server `modules/widget.js`: Schlüssel pro Person (Hash in
  `widget_tokens`), `/api/widget/daten` ohne Anmeldung, nur mit Header `X-Widget-Key` (in `auth.js` freigegeben).
  Auswahl der Zettel (Liste, Aufgaben, Essen, Tür-Nachricht, Termine) in der App; pro Widget per „Parameter“
  (z. B. `tuer,essen`) änderbar. Klein 1, Mittel 2, Groß bis 4 Zettel, Türfarbe als Hintergrund.
  Getestet mit Nachbau `scripts/scriptable-nachbau.cjs` (führt Skript aus, zeichnet Vorschau) – echtes
  Scriptable nicht testbar, Nutzer nach Screenshot fragen. Daten für Morgen-Nachricht + Widget: `server/summary.js`.
- **Mehr** (#/einstellungen), Reihenfolge von den Nutzern festgelegt: Nachricht an die Tür, Wir zwei (Profile),
  Galerie, Kühlschrank (Türfarbe, Fotos an/aus), Benachrichtigungen, Widget, Kalender, Dieses Gerät (+ Abmelden).
- **App-Icon** (Mehr → Dieses Gerät, pro Gerät): „Original“ oder „Nacht“ (Kaits Wunsch: blau, Mond, Sterne, Fenster
  leuchtet). `public/js/appicon.js` tauscht `<link rel="apple-touch-icon">` (localStorage `haushalt_app_icon`).
  iPhone übernimmt das Icon nur beim „Zum Home-Bildschirm“ -> muss in SAFARI gewählt werden (Home-Bildschirm-App hat
  eigenen Speicher, dort nur Hinweis), dann altes Symbol löschen + neu hinzufügen (danach neu anmelden +
  Benachrichtigungen wieder einschalten). Icons: `scripts/make-art.py` (icon-nacht.svg) + `scripts/make-icons.cjs`.
- **Einstellungen pro Person** (Nutzerwunsch 7.11.: „alle Einstellungen pro Person“): `server/modules/prefs.js`
  (Migration 15, Tabelle `person_prefs`, in /api/state als `prefs` {personId: …}), Client `myPrefs()` /
  `updateMyPrefs()` in store.js. Pro Person: Türfarbe + „Fotos an der Tür“ (fallen auf die alten gemeinsamen
  `settings` zurück), aufgeklappte Küchen-Zettel (`openNotes`), angeschaute Tür-Nachrichten (`seenMessages`; schon
  gesehene -> Tür zeigt sie kurz und geht von selbst auf), Benachrichtigungen (`push`; Server nimmt sie für alle
  Handys der Person, Fallback: prefs am Abo). Pro GERÄT bleiben nur „Wer bist du?“ und das App-Icon (Nutzerwahl).
  Widget-Hintergrund = Türfarbe der Person.
- Profile: jedes Gerät fragt einmal „Wer bist du?“ und schickt `X-Person` mit (wer-hat-was).
- **Backup** am 7.11.2026 mit den Nutzern geprüft (siehe „Betrieb“).
- Von den Nutzern getestet: alles bis einschließlich Küche + Haushalt („funktioniert alles“).

## Offen
- **Nachricht an die Tür**: von den Nutzern getestet, „perfekt, jetzt ist es super“ (7.11. abends).
- Filmabend, Animationen, verstreute Fotos, Zuklappen, Galerie: live, Feedback der Nutzer abwarten.
- **Benachrichtigungen + Widget**: live seit 7.11. spätabends, mit den Nutzern am echten iPhone einrichten
  (Home-Bildschirm-App, Scriptable) und Feedback abwarten.
- **App-Icon „Nacht“ + Einstellungen pro Person**: live seit 7./8.11., noch nicht von den Nutzern bestätigt.
  Kait will das Nacht-Icon -> beim Neu-Hinzufügen (in Safari wählen!) begleiten, nach Screenshot fragen.
- **Reihenfolge, um weiterzumachen** (Vorschlag): 1. Nutzer beim Einrichten am iPhone begleiten (Icon neu
  hinzufügen -> anmelden -> „Wer bist du?“ -> Benachrichtigungen erlauben + „Test schicken“ -> Widget via
  Scriptable), 2. dann nächste Idee per Klick-Fragen (Fotos bei Rezepten oder Wochen-Rückblick).
- **Nächste gewünschte Ideen** (Nutzer am 7.11. gewählt, vorher per Klick-Fragen klären):
  **Wochen-Rückblick** (Sonntags-Zettel: erledigt, gekocht, geguckt).
  **Fotos bei Rezepten** (Nutzer am 7.11.: eigene Bilder vom Essen zu einem Rezept hinzufügen).
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
