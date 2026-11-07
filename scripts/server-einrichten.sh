#!/usr/bin/env bash
# =====================================================================
#  Haushalt-App auf einem frischen Online-Server einrichten
#  (getestet für Ubuntu 24.04 – z. B. Hetzner Cloud)
#
#  Aufruf im entpackten Projektordner, als root:
#      bash scripts/server-einrichten.sh
#
#  Was das Skript macht:
#   1. System aktualisieren + automatische Sicherheits-Updates einschalten
#   2. Docker installieren (falls noch nicht da)
#   3. Firewall: nur SSH (22), HTTP (80) und HTTPS (443) offen
#   4. SSH: Anmeldung per Passwort abschalten (nur, wenn ein SSH-Schlüssel da ist)
#   5. Domain + Haushalts-Passwort abfragen und in .env speichern
#   6. App + Caddy (HTTPS) starten
#   7. Tägliche Sicherung der Datenbank um 3:30 Uhr einrichten
#
#  Nochmal ausführen ist ungefährlich – so spielst du auch Updates ein.
# =====================================================================
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE=(docker compose -f "$APP_DIR/docker-compose.online.yml" --project-directory "$APP_DIR")

gruen() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
gelb()  { printf '\033[1;33m%s\033[0m\n' "$*"; }
rot()   { printf '\033[1;31m%s\033[0m\n' "$*"; }

if [[ $EUID -ne 0 ]]; then
  rot "Bitte als root ausführen (oder mit: sudo bash scripts/server-einrichten.sh)"
  exit 1
fi
if [[ ! -f "$APP_DIR/docker-compose.online.yml" ]]; then
  rot "docker-compose.online.yml nicht gefunden – bist du im richtigen Ordner?"
  exit 1
fi

# ---------------------------------------------------------------- 1
gruen "1/7  System aktualisieren (dauert beim ersten Mal ein paar Minuten)"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get upgrade -y -q
apt-get install -y -q ca-certificates curl ufw unattended-upgrades
# Sicherheits-Updates automatisch einspielen
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF

# ---------------------------------------------------------------- 2
gruen "2/7  Docker"
if command -v docker >/dev/null 2>&1; then
  echo "Docker ist schon installiert."
else
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker >/dev/null

# ---------------------------------------------------------------- 3
gruen "3/7  Firewall (nur SSH, HTTP, HTTPS)"
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw allow 443/udp >/dev/null
ufw --force enable >/dev/null
ufw status | sed 's/^/   /'

# ---------------------------------------------------------------- 4
gruen "4/7  SSH absichern"
if [[ -s /root/.ssh/authorized_keys ]]; then
  cat > /etc/ssh/sshd_config.d/10-haushalt.conf <<'EOF'
# Von der Haushalt-App eingerichtet: nur noch mit SSH-Schlüssel anmelden
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
EOF
  systemctl reload ssh 2>/dev/null || systemctl reload sshd 2>/dev/null || true
  echo "Anmeldung nur noch mit SSH-Schlüssel."
else
  gelb "Kein SSH-Schlüssel gefunden – Passwort-Anmeldung bleibt an."
  gelb "Tipp: Beim Server-Anbieter einen SSH-Schlüssel hinterlegen (siehe docs/ONLINE.md)."
fi

# ---------------------------------------------------------------- 5
gruen "5/7  Einstellungen (.env)"
ENV_FILE="$APP_DIR/.env"
if [[ -f "$ENV_FILE" ]]; then
  echo "Vorhandene Einstellungen werden weiter benutzt ($ENV_FILE)."
  echo "(Zum Ändern: nano $ENV_FILE  – danach dieses Skript nochmal starten.)"
else
  SERVER_IP="$(curl -4 -fsS --max-time 5 https://api.ipify.org || hostname -I | awk '{print $1}')"
  echo "Die öffentliche IP dieses Servers ist: $SERVER_IP"
  echo
  while true; do
    read -rp "Domain der App (z. B. unserhaushalt.duckdns.org): " DOMAIN
    DOMAIN="${DOMAIN#http://}"; DOMAIN="${DOMAIN#https://}"; DOMAIN="${DOMAIN%%/*}"
    DOMAIN="$(echo "$DOMAIN" | tr 'A-Z' 'a-z' | tr -d '[:space:]')"
    if [[ "$DOMAIN" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$ ]]; then break; fi
    rot "Das sieht nicht wie eine Domain aus – bitte nochmal."
  done

  echo
  echo "Haushalts-Passwort: mind. 10 Zeichen. Einfach Enter drücken = eins wird erzeugt."
  while true; do
    read -rsp "Passwort: " PW; echo
    if [[ -z "$PW" ]]; then
      PW="$(head -c 2000 /dev/urandom | tr -dc 'a-km-z2-9' | cut -c1-16 | sed 's/.\{4\}/&-/g; s/-$//')"
      GENERATED=1
      break
    fi
    if [[ ${#PW} -lt 10 ]]; then rot "Zu kurz (mind. 10 Zeichen)."; continue; fi
    if [[ "$PW" == *"'"* ]]; then rot "Bitte kein ' (Apostroph) im Passwort."; continue; fi
    read -rsp "Nochmal zur Kontrolle: " PW2; echo
    [[ "$PW" == "$PW2" ]] && break
    rot "Stimmt nicht überein – bitte nochmal."
  done

  umask 077
  cat > "$ENV_FILE" <<EOF
# Einstellungen der Haushalt-App (nur für root lesbar)
DOMAIN=$DOMAIN
HAUSHALT_PASSWORT='$PW'
EOF
  chmod 600 "$ENV_FILE"
  echo "Gespeichert in $ENV_FILE"
fi

# Domain prüfen: zeigt sie wirklich auf diesen Server?
DOMAIN="$(grep -E '^DOMAIN=' "$ENV_FILE" | cut -d= -f2-)"
SERVER_IP="${SERVER_IP:-$(curl -4 -fsS --max-time 5 https://api.ipify.org || true)}"
DNS_IP="$(getent ahostsv4 "$DOMAIN" | awk 'NR==1{print $1}' || true)"
if [[ -n "$SERVER_IP" && "$DNS_IP" != "$SERVER_IP" ]]; then
  gelb "Achtung: $DOMAIN zeigt auf '${DNS_IP:-nichts}', dieser Server hat aber $SERVER_IP."
  gelb "HTTPS klappt erst, wenn die Domain auf $SERVER_IP zeigt (bei DuckDNS: IP eintragen)."
  gelb "Das Skript macht trotzdem weiter – Caddy versucht es automatisch immer wieder."
fi

# ---------------------------------------------------------------- 6
gruen "6/7  App + HTTPS starten"
mkdir -p "$APP_DIR/data"
chown 1000:1000 "$APP_DIR/data"   # die App läuft im Container als Benutzer 1000
"${COMPOSE[@]}" up -d --build --remove-orphans
docker image prune -f >/dev/null

echo -n "Warte auf die App "
for _ in $(seq 1 30); do
  if docker exec haushalt wget -qO- http://127.0.0.1:8080/api/health >/dev/null 2>&1; then echo " läuft ✓"; break; fi
  echo -n "."; sleep 2
done

# ---------------------------------------------------------------- 7
gruen "7/7  Tägliche Sicherung"
cat > /etc/cron.d/haushalt-backup <<EOF
# Sicherung der Haushalt-Datenbank, jeden Tag um 3:30 Uhr (die letzten 14 Tage bleiben)
30 3 * * * root ${COMPOSE[*]} exec -T haushalt node --disable-warning=ExperimentalWarning server/backup.js >> /var/log/haushalt-backup.log 2>&1
EOF
chmod 644 /etc/cron.d/haushalt-backup
echo "Sicherungen landen in $APP_DIR/data/backups/"

# ---------------------------------------------------------------- fertig
echo
printf '\033[1;32m%s\033[0m\n' "Fertig! 🏡"
echo
echo "   Einkaufsliste:  https://$DOMAIN/#/liste"
echo "   Vorrat:         https://$DOMAIN/#/vorrat"
if [[ "${GENERATED:-0}" == 1 ]]; then
  echo
  echo "   Euer Haushalts-Passwort:  $PW"
  gelb "   -> Jetzt aufschreiben bzw. im Passwort-Manager speichern!"
fi
echo
echo "   Das erste Öffnen kann ~1 Minute dauern (Zertifikat wird geholt)."
echo "   Probleme? Log ansehen mit:"
echo "   docker compose -f $APP_DIR/docker-compose.online.yml logs --tail 50"
