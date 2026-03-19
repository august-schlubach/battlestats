# Backend Droplet Deploy Runbook

This runbook deploys the Django backend on a bare Ubuntu DigitalOcean droplet while keeping the existing DigitalOcean managed Postgres database as the system of record.

## Production shape

- Django runs under gunicorn on `127.0.0.1:8888`.
- Celery worker and Celery beat run as systemd services.
- Redis and RabbitMQ run locally on the droplet via apt-managed services.
- Database traffic goes to the existing DigitalOcean managed Postgres target using the cloud env files from `server/.env.cloud` and `server/.env.secrets.cloud`.
- The DigitalOcean CA certificate is installed on the droplet and referenced with an absolute `DB_SSLROOTCERT` path.

## One-time bootstrap

From the repo root:

```bash
chmod +x server/deploy/bootstrap_droplet.sh server/deploy/deploy_to_droplet.sh
./server/deploy/bootstrap_droplet.sh 45.55.66.19
```

The bootstrap installs:

- Python 3 with venv support
- Redis
- RabbitMQ
- release directories under `/opt/battlestats-server`
- systemd units:
  - `battlestats-gunicorn`
  - `battlestats-celery`
  - `battlestats-beat`

## Deploy

When backend changes are ready:

```bash
./server/deploy/deploy_to_droplet.sh 45.55.66.19
```

That deploy does all of the following:

- uploads `server/.env.cloud`
- uploads `server/.env.secrets.cloud`
- uploads `server/ca-certificate.crt`
- syncs the `server/` directory to a timestamped release
- syncs the top-level `agents/` directory because the backend agentic runtime reads it at runtime
- updates the remote env files to use the absolute CA cert path and droplet-local Redis/RabbitMQ values
- installs Python dependencies into `/opt/battlestats-server/venv`
- runs `manage.py migrate`
- runs `manage.py collectstatic --noinput`
- runs `manage.py check`
- flips `/opt/battlestats-server/current` to the new release
- restarts gunicorn, celery worker, and celery beat

## Remote config files

The deploy uses these droplet files:

- `/etc/battlestats-server.env`
- `/etc/battlestats-server.secrets.env`
- `/etc/ssl/certs/battlestats-do-ca-certificate.crt`

The deploy script populates them from the existing repo cloud target files, so the backend continues using the established managed Postgres connection details instead of a second config source.

## Service checks

Useful remote checks:

```bash
ssh root@45.55.66.19 'systemctl status battlestats-gunicorn --no-pager'
ssh root@45.55.66.19 'systemctl status battlestats-celery --no-pager'
ssh root@45.55.66.19 'systemctl status battlestats-beat --no-pager'
ssh root@45.55.66.19 'journalctl -u battlestats-gunicorn -n 100 --no-pager'
ssh root@45.55.66.19 'curl -s http://127.0.0.1:8888/api/player/Mebuki/ | head'
```
