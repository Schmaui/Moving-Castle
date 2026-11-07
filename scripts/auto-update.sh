#!/usr/bin/env bash
# =====================================================================
#  Automatisches Update vom GitHub-Repository.
#  Läuft per Cron alle 5 Minuten (eingerichtet von auto-update-einrichten.sh).
#  Gibt es neue Commits auf "main", wird die App neu gebaut und gestartet.
#  Daten (data/) und Einstellungen (.env) bleiben unberührt.
#  Log: /var/log/haushalt-update.log
# =====================================================================
set -euo pipefail
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_DIR"

# nie zwei Updates gleichzeitig
exec 9>/tmp/haushalt-update.lock
flock -n 9 || exit 0

git fetch -q origin main
LOCAL="$(git rev-parse HEAD)"
REMOTE="$(git rev-parse origin/main)"
[[ "$LOCAL" == "$REMOTE" ]] && exit 0

echo "$(date '+%F %T') Update ${LOCAL:0:7} -> ${REMOTE:0:7}: $(git log -1 --format=%s origin/main)"
git reset -q --hard origin/main
mkdir -p data && chown 1000:1000 data
docker compose -f docker-compose.online.yml --project-directory "$APP_DIR" up -d --build --remove-orphans
docker image prune -f >/dev/null
echo "$(date '+%F %T') Update fertig"
