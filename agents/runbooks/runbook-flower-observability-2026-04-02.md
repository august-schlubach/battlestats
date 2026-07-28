# Runbook: Flower + RabbitMQ Observability On The Droplet

**Created**: 2026-04-02 (planned) · **Deployed**: 2026-06-24 · **Status**: LIVE
**Scope**: A persistent Flower instance + the RabbitMQ management UI on the
production droplet, so operators see queue depth, worker liveness, and per-task
history without hand-combining `rabbitmqctl`, `celery inspect`, and `journalctl`.

## What's actually deployed (2026-06-24)

| Piece | Where | Exposure |
| --- | --- | --- |
| Flower 2.0.1 | `battlestats-flower.service`, `127.0.0.1:5555` | `https://battlestats.online/flower` — nginx home-IP allowlist + Flower basic-auth |
| RabbitMQ management UI | `rabbitmq_management` plugin, `127.0.0.1:15672` | `https://rabbitmq.battlestats.online` — own subdomain, root path, nginx home-IP allowlist + RabbitMQ login |
| Task events | `worker_send_task_events=True` in `server/battlestats/celery.py` | n/a — makes Flower's task history populate |

The earlier (2026-04-02) plan assumed Flower in the **app** venv via
`celery -A battlestats flower`. The shipped design differs deliberately:

- **Dedicated venv** `/opt/battlestats-flower/venv`, not the app venv — Flower is
  decoupled from the app release cycle (a `pip install -r requirements.txt` on
  deploy can't disturb it, and it has no Django/app import dependency).
- **Standalone invocation** `celery --broker=<url> flower …` (no `-A`) — Flower 2.x
  ships **no `flower` console-script**; it's a `celery` subcommand. The dedicated
  venv has only `celery` + `flower`, not the app, so `-A battlestats` is unavailable
  (and unnecessary — Flower discovers workers over the control bus and reads queue
  lengths via `broker_api`).
- **Own env file** `/etc/battlestats-flower.env` (root:battlestats 640), not the
  shared app env.

## Files / units

- `/opt/battlestats-flower/venv` — dedicated venv (`flower`, `celery`, `tornado`).
- `/opt/battlestats-flower/flower.db` — persistent task history (survives restarts).
- `/etc/battlestats-flower.env` — `FLOWER_BROKER`, `FLOWER_BROKER_API`,
  `FLOWER_BASIC_AUTH` (the operator login), `FLOWER_PURGE_OFFLINE_WORKERS`.
- `/etc/systemd/system/battlestats-flower.service` — re-asserted by
  `deploy_to_droplet.sh` whenever the venv + env exist (guarded, so a fresh box
  without the one-time provisioning doesn't get a failing unit).
- nginx: `location = /flower { return 301 /flower/; }` + `location /flower/ { allow 130.44.131.215; deny all; proxy_pass http://127.0.0.1:5555; … }`
  in `sites-available/battlestats-client.conf` — same allowlist pattern as `/umami`.
  The bare-`/flower` redirect matters: Flower (`url_prefix=flower`) only serves under
  `/flower/` and 404s the un-slashed path, so a greedy `location /flower` would 404.

## What the deploy script does for you

`server/deploy/deploy_to_droplet.sh` now:

1. `configure_local_rabbitmq()` → `rabbitmq-plugins enable rabbitmq_management`
   (idempotent; persisted in `enabled_plugins`, survives the routine broker restart).
2. (Re)asserts `battlestats-flower.service` from the dedicated venv + env when both
   are present, then `enable --now` + `try-restart`.

It does **not** create the venv, env file, RabbitMQ monitoring user, or nginx block.
Those are the one-time provisioning below (needed on a fresh droplet / rebuild).

## One-time provisioning (fresh box / rebuild)

```bash
# 1. RabbitMQ read-only monitoring user (Flower's broker_api; `guest` is deleted by deploy)
RMQ_PASS=$(openssl rand -hex 16)
rabbitmqctl add_user flower "$RMQ_PASS"
rabbitmqctl set_user_tags flower monitoring
# Flower needs to DECLARE its event queue and publish control commands, so
# configure/write are scoped to the event + pidbox resources (not '^$', which
# blocks the AMQP side entirely), and read stays broad for monitoring.
FLOWER_PAT='^(celeryev(\..*)?|celery\.pidbox|(.*\.)?reply\.celery\.pidbox|kombu\..*)$'
rabbitmqctl set_permissions -p / flower "$FLOWER_PAT" "$FLOWER_PAT" '.*'

# 2. dedicated venv
python3 -m venv /opt/battlestats-flower/venv
/opt/battlestats-flower/venv/bin/pip install --upgrade pip wheel flower
chown -R battlestats:battlestats /opt/battlestats-flower

# 3. env file. FLOWER_BROKER points at the broker HOST from the app's URL but
# authenticates as the `flower` monitoring user — NOT the app's administrator
# account. The deploy re-derives this line every run (see "What the deploy
# script does"), so a broker password rotation self-heals.
B=$(grep -hoP '^CELERY_BROKER_URL=\K.*' /etc/battlestats-server.env /etc/battlestats-server.secrets.env | tail -1); B=${B%\"}; B=${B#\"}
BROKER_HOST=${B#*@}
umask 027
cat > /etc/battlestats-flower.env <<EOF
FLOWER_BROKER=amqp://flower:${RMQ_PASS}@${BROKER_HOST}
FLOWER_BROKER_API=http://flower:${RMQ_PASS}@127.0.0.1:15672/api/
FLOWER_BASIC_AUTH=admin:$(openssl rand -hex 16)
FLOWER_PURGE_OFFLINE_WORKERS=300
EOF
chown root:battlestats /etc/battlestats-flower.env && chmod 640 /etc/battlestats-flower.env

# 4. the systemd unit is written by the next deploy; or hand-write it (see /etc/systemd/system/battlestats-flower.service)

# 5. nginx — add inside the 443 server block of sites-available/battlestats-client.conf,
#    just before `location / {` (mirror the /umami block; rotate the allow IP if home IP changes).
#    Note the bare-/flower redirect — Flower serves only under /flower/ and 404s otherwise:
#      location = /flower { return 301 /flower/; }
#      location /flower/ {
#          allow 130.44.131.215; deny all;
#          proxy_pass http://127.0.0.1:5555;
#          proxy_http_version 1.1;
#          proxy_set_header Host $host;
#          proxy_set_header X-Real-IP $remote_addr;
#          proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
#          proxy_set_header X-Forwarded-Proto $scheme;
#          proxy_set_header Upgrade $http_upgrade;
#          proxy_set_header Connection "upgrade";
#      }
#    then: nginx -t && systemctl reload nginx
```

## Access

- **Flower (daily driver):** from the home network (allow-listed IP), browse
  `https://battlestats.online/flower` and log in with `FLOWER_BASIC_AUTH`.
- **RabbitMQ UI:** from the home network, browse `https://rabbitmq.battlestats.online`
  and log in as `flower` (password in `/etc/battlestats-flower.env`).
- **Either, off the home network:** SSH tunnel —
  `ssh -N -L 5555:127.0.0.1:5555 -L 15672:127.0.0.1:15672 root@battlestats.online`,
  then `http://localhost:5555/flower` and `http://localhost:15672`.

## RabbitMQ exposure (own subdomain, deployed 2026-06-24)

The management SPA doesn't proxy cleanly under a subpath without
`management.path_prefix` (a `rabbitmq.conf` change needing a broker restart), so it
lives on its **own subdomain at root path** instead — no prefix gymnastics, no broker
restart. Setup (DNS is DigitalOcean, `doctl` authed on the droplet; cert via certbot):

```bash
doctl compute domain records create battlestats.online --record-type A \
  --record-name rabbitmq --record-data 45.55.66.19 --record-ttl 300
certbot certonly --nginx -d rabbitmq.battlestats.online --non-interactive
# nginx: sites-available/rabbitmq-ui.conf — 80→443 redirect + a 443 server that
#   allow 130.44.131.215; deny all;  then  proxy_pass http://127.0.0.1:15672;
#   (full block written by deploy/scratch script rabbitmq_subdomain.sh)
```

Same two-layer model as Flower: nginx home-IP allowlist at the edge, RabbitMQ's own
login as the credential layer. ufw still blocks 15672 directly. Flower also surfaces
queue depth via `broker_api`, so this UI is mainly for deeper broker introspection
(connections, channels, exchanges, message rates).

## Security model

ufw allows only 22/80/443; 5555 and 15672 never reach the internet directly. Public
access to Flower is gated by the nginx **home-IP allowlist** (`deny all` otherwise),
and then by Flower's **own basic-auth** — IP at the edge, credentials at the app, the
same two-layer model as `/umami`. The RabbitMQ `flower` user is **read-only**
(`'^$' '^$' '.*'`). Rotate the allow IP in `battlestats-client.conf` if home IP changes.

## Validation

```bash
ssh root@battlestats.online 'systemctl is-active battlestats-flower; ss -ltnp | grep 5555'
# Flower under the prefix (expect 200 with auth, 401 without):
ssh root@battlestats.online 'curl -s -o /dev/null -w "%{http_code}\n" -u "$(grep -oP "^FLOWER_BASIC_AUTH=\K.*" /etc/battlestats-flower.env)" http://127.0.0.1:5555/flower/'
# allowlist enforces (expect 403 from a non-allowed IP):
ssh root@battlestats.online 'curl -sk -o /dev/null -w "%{http_code}\n" -H "Host: battlestats.online" https://127.0.0.1/flower/'
# cross-check Flower against raw broker state:
ssh root@battlestats.online 'rabbitmqctl list_queues name messages_ready messages_unacknowledged consumers'
```

Flower's Workers tab should list `default`, `hydration`, `background`, `crawls`,
`floor`; the Tasks tab populates from `worker_send_task_events`, which lives in
`server/battlestats/settings.py` as **`CELERY_WORKER_SEND_TASK_EVENTS`** (default on,
kill switch `CELERY_WORKER_SEND_TASK_EVENTS=0`) and is guarded by
`warships/tests/test_celery_observability_config.py`. It is set in code rather than as
a `-E` flag on the worker ExecStart so it survives the unit file being rewritten.

**The Workers tab and the Tasks tab fail independently** — worker liveness rides the
control channel, task history rides events. A worker list that looks healthy proves
nothing about the freshness of the task list.

## Incident: a month blind, reported as healthy (2026-07-27)

Flower sat with a **stale broker password** in `/etc/battlestats-flower.env` after a
rotation. Symptoms and the trap:

- `amqp.exceptions.AccessRefused: (403)` every 5s — **~34,600 failed logins/day**,
  churning `/var/log/rabbitmq/`. The unit stayed `active`, so systemd looked fine.
- The Workers tab was empty. That is a **Flower** fault, not a worker outage — the
  RabbitMQ `consumers` column showed all five lanes consuming normally throughout.
- **The dangerous part:** Flower runs `--persistent=True`. With the event stream dead
  it kept serving the last rows in `flower.db` — a month-old snapshot — and
  `event_check.sh` summarised them as current. A healthy-looking "495 SUCCESS, 0.4%
  failure rate" table was reporting June data in late July.

Fixes applied (all in-repo so they stick):

1. `FLOWER_BROKER` is now **derived on every deploy** from `FLOWER_BROKER_API`'s
   credentials + `CELERY_BROKER_URL`'s host, instead of being hand-maintained. A future
   rotation self-heals. `prov_flower.sh` (referenced by the old env header) no longer
   exists anywhere — nothing else regenerates this file.
2. The deploy **warns loudly** if Flower is being refused by the broker right after
   restart. Warn, never fail: Flower is observability, not runtime.
3. Flower authenticates as the `flower` monitoring user, not the `battlestats`
   administrator, with configure/write scoped to event + pidbox resources.
4. `event_check.sh` **refuses to summarise** task data whose newest event is older than
   `TASK_STALE_AFTER_S` (default 600s), and prints the freshness age when it does
   report. An empty worker list now says STALE and points at the broker connection.
5. `CELERY_WORKER_SEND_TASK_EVENTS` was missing entirely — the workers had never been
   emitting task events since the rotation, so even a healthy Flower would have shown a
   frozen Tasks tab.

Lesson worth carrying: **a monitoring surface that persists its last-known state must
report the age of that state, or it will lie quietly.**

## Notes / constraints

- Droplet is 2 vCPU / 8 GB (+2 GB swap); Flower adds a small Python process + the
  persistent DB. Measured fine at load ~0.7. The binding constraint remains the
  managed Postgres, not observability.
- Flower makes backlog *visible*; it doesn't reduce it. Queue-pressure tuning lives in
  the floor/enrichment runbooks.
- Sentry (centralized error capture for Django + Celery) is the planned next
  observability layer — deferred; needs a project DSN + `sentry-sdk` in requirements.
