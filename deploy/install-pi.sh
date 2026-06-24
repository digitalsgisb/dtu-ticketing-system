#!/usr/bin/env bash
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run this installer with sudo."
  exit 1
fi

APP_SOURCE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_ROOT="/opt/dtu-control"
RELEASES_DIR="$APP_ROOT/releases"
RELEASE_ID="$(date -u +%Y%m%d%H%M%S)"
RELEASE_DIR="$RELEASES_DIR/$RELEASE_ID"

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "Node.js 24 LTS and npm are required."
  exit 1
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [[ "$NODE_MAJOR" -lt 24 ]]; then
  echo "Node.js 24 or newer is required. Found: $(node --version)"
  exit 1
fi

if [[ ! -f "$APP_SOURCE/dist/index.html" || ! -f "$APP_SOURCE/dist-server/server/index.js" || ! -f "$APP_SOURCE/dist-server/scripts/backup.js" ]]; then
  echo "Production build artifacts are missing. Run 'npm ci' and 'npm run build' before this installer."
  exit 1
fi

id -u dtu >/dev/null 2>&1 || useradd --system --home /var/lib/dtu-control --shell /usr/sbin/nologin dtu
install -d -o root -g dtu -m 0750 "$APP_ROOT" "$RELEASES_DIR"
install -d -o root -g dtu -m 0750 "$RELEASE_DIR"
install -d -o dtu -g dtu -m 0750 /var/lib/dtu-control /var/lib/dtu-control/uploads /var/lib/dtu-control/backups

cp -a "$APP_SOURCE/dist" "$RELEASE_DIR/dist"
cp -a "$APP_SOURCE/dist-server" "$RELEASE_DIR/dist-server"
install -m 0640 -o root -g dtu "$APP_SOURCE/package.json" "$RELEASE_DIR/package.json"
install -m 0640 -o root -g dtu "$APP_SOURCE/package-lock.json" "$RELEASE_DIR/package-lock.json"

(
  cd "$RELEASE_DIR"
  npm ci --omit=dev --no-audit --no-fund
)

chown -R root:dtu "$RELEASE_DIR"
find "$RELEASE_DIR" -type d -exec chmod 0750 {} +
find "$RELEASE_DIR" -type f -exec chmod 0640 {} +
ln -sfn "$RELEASE_DIR" "$APP_ROOT/current.next"
mv -Tf "$APP_ROOT/current.next" "$APP_ROOT/current"

if [[ ! -f /etc/dtu-control.env ]]; then
  install -m 0640 -o root -g dtu "$APP_SOURCE/deploy/dtu-control.env.example" /etc/dtu-control.env
  echo "Created /etc/dtu-control.env. Edit its passwords, URLs, Turnstile, SMTP and R2 values before launch."
fi

install -m 0644 "$APP_SOURCE/deploy/dtu-control.service" /etc/systemd/system/dtu-control.service
install -m 0644 "$APP_SOURCE/deploy/dtu-backup.service" /etc/systemd/system/dtu-backup.service
install -m 0644 "$APP_SOURCE/deploy/dtu-backup.timer" /etc/systemd/system/dtu-backup.timer
systemctl daemon-reload
systemctl enable dtu-control.service dtu-backup.timer
if systemctl is-active --quiet dtu-control.service; then
  systemctl restart dtu-control.service
fi
echo "Release $RELEASE_ID installed without copying .env, data, uploads, logs, Git history, or development dependencies."
echo "Review /etc/dtu-control.env, then run: sudo systemctl start dtu-control dtu-backup.timer"
