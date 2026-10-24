#!/usr/bin/env bash
# Deploy or update the server on the VM. Run on the VM as root:
#   BRANCH=main bash /opt/consent/app/server/deploy/deploy.sh
# First time: secrets go in /etc/consent/env (see env.example); this script never prints them.
set -euo pipefail
BRANCH="${BRANCH:-main}"
REPO="https://github.com/b-3llum/hackpsu26.git"
APP=/opt/consent/app

id -u consent >/dev/null 2>&1 || useradd --system --create-home --home-dir /opt/consent --shell /usr/sbin/nologin consent
install -d -o consent -g consent -m 750 /var/lib/consent
install -d -o root -g consent -m 750 /etc/consent

if [ ! -d "$APP/.git" ]; then
  sudo -u consent git clone --quiet "$REPO" "$APP"
fi
sudo -u consent git -C "$APP" fetch --quiet origin
sudo -u consent git -C "$APP" checkout --quiet "$BRANCH"
sudo -u consent git -C "$APP" reset --quiet --hard "origin/$BRANCH"
(cd "$APP/server" && sudo -u consent npm ci --omit=dev --silent)

install -m 644 "$APP/server/deploy/consent.service" /etc/systemd/system/consent.service
install -m 644 "$APP/server/deploy/Caddyfile" /etc/caddy/Caddyfile
systemctl daemon-reload
systemctl enable --quiet consent
systemctl restart consent
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null
systemctl reload caddy || systemctl restart caddy
sleep 1
systemctl is-active consent
echo "deployed $(sudo -u consent git -C "$APP" rev-parse --short HEAD) from $BRANCH"
