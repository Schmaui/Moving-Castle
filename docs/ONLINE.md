# Haushalt-App online stellen (eigener kleiner Server)

Damit funktioniert die App **überall** – zu Hause, im Supermarkt, unterwegs.
Geschützt ist sie mit einem **gemeinsamen Haushalts-Passwort** und einer
**verschlüsselten Verbindung (HTTPS)**.

**Du brauchst:** ca. 30–45 Minuten, deinen Laptop, die `haushalt.zip`.
**Kosten:** ca. 4–6 € im Monat für den Server (die Domain von DuckDNS ist kostenlos).

> Keine Sorge, wenn du so etwas noch nie gemacht hast: Du kopierst nur Befehle
> und fügst sie ein. Die eigentliche Arbeit macht ein Skript.
> Wenn irgendwo etwas anders aussieht: Screenshot machen und nachfragen.

Überblick:

1. SSH-Schlüssel erstellen (dein „digitaler Haustürschlüssel“ für den Server)
2. Server bei Hetzner mieten
3. Kostenlose Adresse bei DuckDNS holen
4. App auf den Server kopieren
5. Einrichtungs-Skript starten
6. Auf den Handys öffnen

---

## 1. SSH-Schlüssel erstellen

Damit meldest du dich später am Server an – sicherer als ein Passwort.

**Windows:** Startmenü → **„cmd“** eintippen → Enter.
**Mac:** `cmd + Leertaste` → **„Terminal“** → Enter.

Dann eingeben:

```bash
ssh-keygen -t ed25519
```

Es kommen drei Fragen – jedes Mal einfach **Enter** drücken.
(Kommt „already exists“ → `n` eingeben, du hast schon einen Schlüssel. Passt.)

Jetzt den **öffentlichen** Teil des Schlüssels anzeigen:

- Windows:
  ```bash
  type %USERPROFILE%\.ssh\id_ed25519.pub
  ```
- Mac:
  ```bash
  cat ~/.ssh/id_ed25519.pub
  ```

Es erscheint eine Zeile, die mit `ssh-ed25519 …` anfängt. Die komplette Zeile
markieren und kopieren – die brauchst du gleich.

> Die Datei **ohne** `.pub` ist dein geheimer Schlüssel. Die gibst du nie weiter.

---

## 2. Server bei Hetzner mieten

Hetzner ist ein deutscher Anbieter, günstig und zuverlässig. (Andere gehen auch,
z. B. Netcup oder IONOS – Hauptsache **Ubuntu 24.04**.)

1. Auf **hetzner.com/cloud** ein Konto anlegen (mit Zahlungsdaten).
2. In der **Cloud Console** ein **Projekt** anlegen, z. B. „Haushalt“.
3. **„Server hinzufügen“** klicken und so auswählen:

| Einstellung | Auswahl |
|---|---|
| Standort | Nürnberg oder Falkenstein (Deutschland) |
| Image | **Ubuntu 24.04** |
| Typ | der **kleinste/günstigste** („Shared vCPU“; x86 oder Arm ist egal) |
| Netzwerk | **Öffentliche IPv4** anlassen |
| SSH-Keys | **„SSH-Key hinzufügen“** → die kopierte Zeile einfügen → Name z. B. „Laptop“ |
| Backups | optional (kostet etwas extra, die App sichert sich aber auch selbst) |
| Name | `haushalt` |

4. **„Kostenpflichtig erstellen“** klicken. Nach ~1 Minute läuft der Server.
5. Die **IPv4-Adresse** notieren (z. B. `91.98.12.34`). Die steht in der Server-Übersicht.

---

## 3. Kostenlose Adresse bei DuckDNS

Damit ihr nicht eine Zahl, sondern einen Namen eintippen müsst – und damit HTTPS klappt.

1. Auf **duckdns.org** gehen und oben mit Google, GitHub o. Ä. anmelden.
2. Bei **„sub domain“** einen Namen ausdenken, z. B. `unserhaushalt` → **„add domain“**.
3. In der Zeile darunter bei **„current ip“** die **IP des Servers** eintragen
   (die von Hetzner, nicht deine eigene!) → **„update ip“**.

Deine Adresse ist jetzt z. B. **`unserhaushalt.duckdns.org`**.

> Alternativ geht auch eine eigene Domain (ca. 1 € im Monat). Dort einen
> **A-Eintrag** auf die Server-IP setzen – der Rest ist gleich.

---

## 4. App auf den Server kopieren

Im Terminal bzw. cmd in den Ordner wechseln, in dem `haushalt.zip` liegt
(meist „Downloads“):

```bash
cd Downloads
```

Hochladen (deine Server-IP statt `91.98.12.34`):

```bash
scp haushalt.zip root@91.98.12.34:/root/
```

Beim ersten Mal kommt eine Frage „Are you sure you want to continue connecting?“
→ `yes` eintippen → Enter.

Jetzt mit dem Server verbinden:

```bash
ssh root@91.98.12.34
```

Ab hier tippst du **auf dem Server**. Du erkennst es an `root@haushalt:~#` vorne.

---

## 5. Einrichtungs-Skript starten

Auf dem Server nacheinander:

```bash
apt-get update && apt-get install -y unzip
```

```bash
unzip -o haushalt.zip -d /opt
```

```bash
cd /opt/haushalt
```

```bash
bash scripts/server-einrichten.sh
```

Das Skript arbeitet jetzt ein paar Minuten (Updates, Docker, Firewall …).
Zwischendurch fragt es zwei Dinge:

- **Domain:** z. B. `unserhaushalt.duckdns.org`
- **Passwort:** euer Haushalts-Passwort (mind. 10 Zeichen). Beim Tippen siehst
  du nichts – das ist normal. Oder einfach **Enter**, dann wird ein sicheres
  Passwort erzeugt und am Ende angezeigt → **aufschreiben!**

Am Ende steht:

```
Fertig! 🏡
   Einkaufsliste:  https://unserhaushalt.duckdns.org/#/liste
```

Mit `exit` trennst du die Verbindung zum Server. Die App läuft weiter –
auch nach einem Neustart des Servers.

---

## 6. Auf den Handys öffnen

1. Am Handy **https://unserhaushalt.duckdns.org** öffnen.
   (Beim allerersten Aufruf kann es bis zu 1 Minute dauern – das Zertifikat wird geholt.)
2. Haushalts-Passwort eingeben → **„Reinkommen“**. Das Handy bleibt angemeldet.
3. Als App-Icon ablegen:
   - **iPhone (Safari):** Teilen-Knopf → „Zum Home-Bildschirm“
   - **Android (Chrome):** ⋮ → „Zum Startbildschirm hinzufügen“
4. **NFC-Sticker** (siehe `NFC.md`) jetzt mit den endgültigen Adressen beschreiben:
   - `https://unserhaushalt.duckdns.org/#/liste`
   - `https://unserhaushalt.duckdns.org/#/vorrat`

---

## Automatische Updates über GitHub (empfohlen)

Statt jedes Mal eine Zip hochzuladen, kann sich der Server neue Versionen
selbst von einem **privaten GitHub-Repository** holen. Dann reicht es, Änderungen
dort hochzuladen – spätestens nach 5 Minuten ist die neue Version online.

Einmalig auf dem Server (statt `BENUTZER/REPOSITORY` euer Repository, z. B. `kait/moving-castle`):

```bash
cd /opt/haushalt && bash scripts/auto-update-einrichten.sh BENUTZER/REPOSITORY
```

Das Skript zeigt einen **Lese-Schlüssel** an. Den bei GitHub im Repository unter
**Settings → Deploy keys → Add deploy key** einfügen (Titel „Server“,
„Allow write access“ **nicht** anhaken), dann im Terminal Enter drücken.

Was passiert ist, steht im Log: `tail /var/log/haushalt-update.log`

> Wichtig: Wer in das Repository schreiben darf, bestimmt, was auf dem Server läuft.
> Repository also **privat** lassen und niemandem sonst Schreibrechte geben.

## Später: Was ist wenn …

### … ich eine neue Version der App habe (Design-Änderungen usw.)?

Mit automatischen Updates (oben): nichts tun – kommt von selbst.
Ohne: neue `haushalt.zip` wie in Schritt 4 hochladen, dann auf dem Server:

```bash
unzip -o haushalt.zip -d /opt
```

```bash
cd /opt/haushalt && bash scripts/server-einrichten.sh
```

Eure Einträge, das Passwort und das Zertifikat bleiben erhalten.

### … wir das Passwort ändern wollen?

Auf dem Server:

```bash
nano /opt/haushalt/.env
```

Bei `HAUSHALT_PASSWORT='…'` das neue Passwort eintragen (zwischen den `'`),
speichern mit `Strg + O`, Enter, beenden mit `Strg + X`. Dann:

```bash
cd /opt/haushalt && bash scripts/server-einrichten.sh
```

Danach sind **alle Geräte abgemeldet** und brauchen das neue Passwort.
(Gut, wenn z. B. ein Handy verloren gegangen ist.)

### … ich die Einträge vom Laptop mitnehmen will?

Am Laptop die App beenden (`Strg + C`), dann im Projektordner auf dem Laptop:

```bash
scp data/haushalt.db root@91.98.12.34:/root/
```

Auf dem Server:

```bash
cd /opt/haushalt && docker compose -f docker-compose.online.yml stop haushalt
```

```bash
cp /root/haushalt.db data/haushalt.db && rm -f data/haushalt.db-wal data/haushalt.db-shm && chown 1000:1000 data/haushalt.db
```

```bash
docker compose -f docker-compose.online.yml start haushalt
```

### … ich eine Sicherung brauche?

Jede Nacht um 3:30 Uhr wird automatisch gesichert (die letzten 14 Tage) nach
`/opt/haushalt/data/backups/`. Eine Sicherung auf den Laptop holen:

```bash
scp root@91.98.12.34:/opt/haushalt/data/backups/haushalt-2026-11-07.db .
```

Zurückspielen geht genau wie „Einträge vom Laptop mitnehmen“ oben.

### … etwas nicht funktioniert?

Auf dem Server das Log ansehen:

```bash
cd /opt/haushalt && docker compose -f docker-compose.online.yml logs --tail 50
```

Häufige Ursachen:

| Problem | Lösung |
|---|---|
| Seite lädt nicht / Zertifikatsfehler | Zeigt die DuckDNS-Adresse auf die **Server-IP**? Ein paar Minuten warten. |
| `Permission denied (publickey)` bei ssh | Am selben Laptop arbeiten, auf dem der SSH-Schlüssel erstellt wurde. |
| „Zu viele Versuche“ | 15 Minuten warten (Schutz gegen Passwort-Raten). |
| Passwort vergessen | Auf dem Server nachschauen: `cat /opt/haushalt/.env` |

---

## Was schützt die App?

- **HTTPS** – alles ist verschlüsselt (Zertifikat von Let's Encrypt, erneuert sich selbst).
- **Haushalts-Passwort** – ohne Passwort kommt niemand an eure Daten.
  Nach 5 falschen Versuchen ist 15 Minuten Pause.
- **Firewall** – nur Webseite (80/443) und SSH (22) sind offen.
- **SSH nur mit Schlüssel** – Passwort-Raten am Server ist zwecklos.
- **Automatische Sicherheits-Updates** für das System.
- **Tägliche Sicherung** der Datenbank.
