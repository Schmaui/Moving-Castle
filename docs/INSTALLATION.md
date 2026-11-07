# Installation zu Hause

> Lieber ohne eigenes Gerät und auch unterwegs nutzbar? → siehe **[ONLINE.md](ONLINE.md)**.

## 1. Hardware vorbereiten

- **Raspberry Pi 4/5:** Mit dem *Raspberry Pi Imager* das **Raspberry Pi OS Lite (64-bit)** aufspielen. Im Imager unter „Einstellungen“ gleich Folgendes setzen:
  - Hostname: `haushalt`
  - Benutzer und Passwort
  - SSH aktivieren
  - WLAN (oder besser ein LAN-Kabel)
- **Mini-PC:** Debian oder Ubuntu Server installieren und den Hostnamen `haushalt` vergeben.

Wichtig: Verwende ein **64-Bit-System**. Das Image läuft auf ARM64 und x86-64.

Per SSH einloggen (vom PC aus):

```bash
ssh deinname@haushalt.local
```

## 2. Docker installieren

```bash
curl -fsSL https://get.docker.com | sh
```

Damit du Docker ohne `sudo` nutzen kannst:

```bash
sudo usermod -aG docker $USER
```

Danach **einmal ab- und wieder anmelden** und prüfen:

```bash
docker compose version
```

## 3. App auf den Server kopieren und starten

Vom PC aus den Projektordner kopieren:

```bash
scp -r haushalt deinname@haushalt.local:~/
```

Auf dem Server starten:

```bash
cd ~/haushalt && mkdir -p data && docker compose up -d --build
```

Prüfen:

```bash
docker compose ps
```

```bash
docker compose logs -f
```

Im Log sollte `Haushalt läuft auf http://0.0.0.0:8080` stehen. Die App startet nach einem Stromausfall oder Neustart von selbst (`restart: unless-stopped`).

> Steht im Log „Datenordner … nicht beschreibbar“, gehört der Ordner `data` einem anderen Benutzer. Lösung: `sudo chown 1000:1000 data` ausführen oder in `docker-compose.yml` die Zeile `user:` mit deiner ID aus `id -u` aktivieren.

## 4. FritzBox: feste IP und Name

1. `http://fritz.box` im Browser öffnen und anmelden.
2. **Heimnetz → Netzwerk → Netzwerkverbindungen**: Den Server (z. B. „haushalt“) suchen und auf **Bearbeiten (Stift)** klicken.
3. Den **Namen** auf `haushalt` setzen.
4. Das Häkchen bei **„Diesem Netzwerkgerät immer die gleiche IPv4-Adresse zuweisen“** setzen und **Übernehmen**.

Die App ist jetzt im Heimnetz erreichbar unter:

**http://haushalt.fritz.box:8080**

(oder über die IP, z. B. `http://192.168.178.50:8080`)

Hinweise:
- **Keine Portfreigabe einrichten.** Die App ist nur für das Heimnetz gedacht. Für unterwegs ist später ein WireGuard-VPN der FritzBox der richtige Weg.
- Am Handy muss das **WLAN aktiv** sein. Über mobile Daten ist `fritz.box` nicht erreichbar.
- Wird `haushalt.fritz.box` auf einem Gerät nicht gefunden (z. B. wegen „Privates DNS“ unter Android oder einem VPN), nimm stattdessen die feste IP.

## 5. Update nach Änderungen am Code

Die geänderten Dateien auf den Server kopieren und dann ausführen:

```bash
cd ~/haushalt && docker compose up -d --build
```

Die Daten im Ordner `data/` bleiben dabei erhalten.

## 6. Backup (einfach)

Die gesamten Daten stecken in `~/haushalt/data/`. Für eine sichere Kopie stoppst du die App kurz:

```bash
cd ~/haushalt && docker compose stop && tar czf ~/haushalt-backup-$(date +%F).tar.gz data && docker compose start
```

Ein automatisches tägliches Backup-Skript (z. B. auf eine FritzBox-NAS-Freigabe) kann später ergänzt werden.

## Neu anfangen (Startdaten erneut einlesen)

Achtung: Damit werden alle Daten gelöscht.

```bash
docker compose down && rm data/haushalt.db* && docker compose up -d
```
