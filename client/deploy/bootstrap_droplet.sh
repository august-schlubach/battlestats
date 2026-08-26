#!/usr/bin/env bash

set -euo pipefail

HOST="${1:-}"
DEPLOY_USER="${DEPLOY_USER:-root}"
APP_ROOT="${APP_ROOT:-/opt/battlestats-client}"
APP_USER="${APP_USER:-battlestats}"
NGINX_SERVER_NAME="${NGINX_SERVER_NAME:-_}"
API_ORIGIN="${API_ORIGIN:-http://127.0.0.1:8888}"

if [[ -z "${APP_ORIGIN:-}" ]]; then
  if [[ "${NGINX_SERVER_NAME}" != "_" ]]; then
    APP_ORIGIN="https://${NGINX_SERVER_NAME%% *}"
  else
    APP_ORIGIN="https://battlestats.online"
  fi
fi

if [[ -z "${HOST}" ]]; then
  echo "Usage: $0 <droplet-ip-or-hostname>" >&2
  exit 1
fi

ssh "${DEPLOY_USER}@${HOST}" \
  APP_ROOT="${APP_ROOT}" \
  APP_USER="${APP_USER}" \
  NGINX_SERVER_NAME="${NGINX_SERVER_NAME}" \
  API_ORIGIN="${API_ORIGIN}" \
  APP_ORIGIN="${APP_ORIGIN}" \
  'bash -s' <<'REMOTE'
set -euo pipefail

export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y ca-certificates curl gnupg nginx rsync

if ! command -v node >/dev/null 2>&1; then
  install -d -m 0755 /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
  echo 'deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main' > /etc/apt/sources.list.d/nodesource.list
  apt-get update
  apt-get install -y nodejs
fi

if ! id -u "${APP_USER}" >/dev/null 2>&1; then
  useradd --system --home "${APP_ROOT}" --shell /usr/sbin/nologin "${APP_USER}"
fi

install -d -o "${APP_USER}" -g "${APP_USER}" "${APP_ROOT}"
install -d -o "${APP_USER}" -g "${APP_USER}" "${APP_ROOT}/releases"

# Written only when absent, so an existing droplet's hand-set flags survive a
# re-bootstrap. That guard is also why the NEXT_PUBLIC_* lines below matter: a
# FRESH droplet gets exactly this file and nothing else, so anything omitted
# here is a feature that silently does not exist on the rebuilt host. Both
# locale flags were live in prod for weeks before they were added here.
# Live values + authority: agents/runbooks/ops-env-reference.md (Client env).
if [ ! -f /etc/battlestats-client.env ]; then
  cat > /etc/battlestats-client.env <<EOF
BATTLESTATS_API_ORIGIN=${API_ORIGIN}
BATTLESTATS_APP_ORIGIN=${APP_ORIGIN}
# Header language selector (en/ko/ja), visible in prod since v5.0.0.
NEXT_PUBLIC_LOCALE_SELECTOR=1
# Browser-language defaulting: an unchosen visitor gets the first supported
# locale in navigator.languages. Live since v5.3.0. Never persisted, so one
# click of the selector overrides it permanently.
NEXT_PUBLIC_LOCALE_AUTODETECT=1
EOF
fi

cat > /etc/systemd/system/battlestats-client.service <<EOF
[Unit]
Description=Battlestats Next.js client
After=network.target

[Service]
Type=simple
User=${APP_USER}
Group=${APP_USER}
WorkingDirectory=${APP_ROOT}/current/client
Environment=NODE_ENV=production
EnvironmentFile=/etc/battlestats-client.env
ExecStart=/usr/bin/env npm start -- --hostname 127.0.0.1 --port 3001
Restart=always
RestartSec=5
TimeoutStartSec=120
# A deploy stops this unit, so npm exits 143 (128 + SIGTERM). Without this line
# systemd files every deploy under "Failed with result 'exit-code'", and the log
# sweep on 2026-08-26 spent real time proving that five such "crashes" in six
# days were simply five deploys. Treat the signal exit as the clean stop it is.
SuccessExitStatus=143

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/nginx/sites-available/battlestats-client.conf <<EOF
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name ${NGINX_SERVER_NAME};

  location /api/ {
    proxy_pass http://127.0.0.1:8888;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    # Latency runbook Tier 2a: shed a stalled upstream fast instead of hanging
    # on nginx's implicit 60s. proxy_read_timeout (20s) sits just below gunicorn
    # timeout=25 (the primary 502 fix), so nginx returns a clean 504 before
    # gunicorn kills the worker. Mirror of server/nginx.conf.
    proxy_connect_timeout 5s;
    proxy_read_timeout 20s;
  }

  location /umami {
    proxy_pass http://127.0.0.1:3002;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
  }

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF

ln -sfn /etc/nginx/sites-available/battlestats-client.conf /etc/nginx/sites-enabled/battlestats-client.conf
rm -f /etc/nginx/sites-enabled/default

# Enable HTTP/2 on certbot-managed 443 listeners (idempotent — only patches exact matches)
SITE_CONF="/etc/nginx/sites-available/battlestats-client.conf"
sed -i 's/listen 443 ssl;/listen 443 ssl http2;/g' "\${SITE_CONF}" 2>/dev/null || true
sed -i 's/listen \[::\]:443 ssl;/listen [::]:443 ssl http2;/g' "\${SITE_CONF}" 2>/dev/null || true

nginx -t
systemctl daemon-reload
systemctl enable nginx battlestats-client
systemctl restart nginx

if [ -d "${APP_ROOT}/current/client" ]; then
  systemctl restart battlestats-client
fi
REMOTE

echo "Droplet bootstrap complete for ${DEPLOY_USER}@${HOST}"
