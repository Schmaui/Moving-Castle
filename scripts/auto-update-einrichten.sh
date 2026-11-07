#!/usr/bin/env bash
# =====================================================================
#  Einmalig auf dem Server: automatische Updates von GitHub einschalten.
#
#  Aufruf (als root, im App-Ordner):
#      bash scripts/auto-update-einrichten.sh BENUTZER/REPOSITORY
#
#  Was passiert:
#   1. Ein "Deploy Key" (nur Lese-Zugriff) für GitHub wird erzeugt
#   2. Du trägst ihn bei GitHub im Repository ein (Anleitung erscheint)
#   3. Der App-Ordner wird mit dem Repository verbunden
#   4. Alle 5 Minuten wird nach Updates geschaut (scripts/auto-update.sh)
#  Daten (data/) und Einstellungen (.env) bleiben unberührt.
# =====================================================================
set -euo pipefail
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
REPO="${1:-}"
KEY=/root/.ssh/haushalt_deploy

gruen() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
rot()   { printf '\033[1;31m%s\033[0m\n' "$*"; }

[[ $EUID -eq 0 ]] || { rot "Bitte als root ausführen."; exit 1; }
[[ "$REPO" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || { rot "Aufruf: bash scripts/auto-update-einrichten.sh BENUTZER/REPOSITORY"; exit 1; }

gruen "1/4  Git installieren"
command -v git >/dev/null || apt-get install -y -q git

gruen "2/4  Lese-Schlüssel für GitHub"
mkdir -p /root/.ssh && chmod 700 /root/.ssh
[[ -f "$KEY" ]] || ssh-keygen -q -t ed25519 -N "" -C "haushalt-server" -f "$KEY"
cat > /root/.ssh/config.d-haushalt <<CFG
Host github-haushalt
  HostName github.com
  User git
  IdentityFile $KEY
  IdentitiesOnly yes
CFG
touch /root/.ssh/config
grep -q "Host github-haushalt" /root/.ssh/config || cat /root/.ssh/config.d-haushalt >> /root/.ssh/config
rm -f /root/.ssh/config.d-haushalt
chmod 600 /root/.ssh/config
ssh-keyscan -q github.com >> /root/.ssh/known_hosts 2>/dev/null
sort -u -o /root/.ssh/known_hosts /root/.ssh/known_hosts

if ! git ls-remote "git@github-haushalt:$REPO.git" >/dev/null 2>&1; then
  echo
  echo "Bitte diesen Schlüssel bei GitHub eintragen:"
  echo "  https://github.com/$REPO/settings/keys/new"
  echo "  Title: Server   |   Key: die Zeile unten   |   'Allow write access' NICHT anhaken"
  echo
  cat "$KEY.pub"
  echo
  read -rp "Wenn eingetragen: Enter drücken … " _
  until git ls-remote "git@github-haushalt:$REPO.git" >/dev/null 2>&1; do
    rot "GitHub lässt den Server noch nicht rein. Schlüssel richtig eingetragen?"
    read -rp "Nochmal versuchen mit Enter (Abbrechen mit Strg+C) … " _
  done
fi
echo "Zugriff auf $REPO klappt ✓"

gruen "3/4  App-Ordner mit GitHub verbinden"
cd "$APP_DIR"
[[ -d .git ]] || git init -q
git remote remove origin 2>/dev/null || true
git remote add origin "git@github-haushalt:$REPO.git"
git fetch -q origin main
git reset -q --hard origin/main
git branch -q -M main
git branch -q --set-upstream-to=origin/main main 2>/dev/null || true
echo "Stand: $(git log -1 --format='%h %s')"

gruen "4/4  Alle 5 Minuten nach Updates schauen"
cat > /etc/cron.d/haushalt-update <<CRON
# Haushalt-App: automatische Updates von GitHub (siehe scripts/auto-update.sh)
*/5 * * * * root bash $APP_DIR/scripts/auto-update.sh >> /var/log/haushalt-update.log 2>&1
CRON
chmod 644 /etc/cron.d/haushalt-update
touch /var/log/haushalt-update.log

echo "Baue die aktuelle Version …"
mkdir -p data && chown 1000:1000 data
docker compose -f docker-compose.online.yml --project-directory "$APP_DIR" up -d --build --remove-orphans
docker image prune -f >/dev/null

echo
printf '\033[1;32m%s\033[0m\n' "Fertig! Neue Versionen auf GitHub landen ab jetzt automatisch (spätestens nach 5 Minuten) auf dem Server."
echo "Was passiert ist, steht in: /var/log/haushalt-update.log"
