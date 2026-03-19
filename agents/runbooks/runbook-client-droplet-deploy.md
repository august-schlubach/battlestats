# Client Droplet Deploy Runbook

This runbook sets up the Next.js client on a bare Ubuntu DigitalOcean droplet without changing the local Docker-based development flow.

## Why this path

- Keep local development exactly where it is today.
- Use a simple push-to-deploy flow from the repo when you want to publish client changes.
- Avoid introducing GitHub Actions or a full CI/CD pipeline before there is real operational pressure for it.

## Production shape

- Nginx listens on port 80 on the droplet.
- Nginx proxies `/api/*` directly to the Django backend on `127.0.0.1:8888` when the backend is deployed on the same droplet.
- Nginx proxies the remaining requests to the Next.js app on `127.0.0.1:3001`.
- The Next.js app still has a `BATTLESTATS_API_ORIGIN` rewrite for non-droplet environments, so local development outside Docker keeps working.
- A systemd unit keeps the client process alive.
- Releases are deployed into `/opt/battlestats-client/releases/<timestamp>` and `current` is switched after a successful build.

## One-time bootstrap

From the repo root:

```bash
chmod +x client/deploy/bootstrap_droplet.sh client/deploy/deploy_to_droplet.sh
API_ORIGIN=http://127.0.0.1:8888 ./client/deploy/bootstrap_droplet.sh 45.55.66.19
```

What the bootstrap does:

- installs Nginx, rsync, and Node.js 20 on the droplet
- creates the `battlestats` system user
- creates `/etc/battlestats-client.env`
- installs the `battlestats-client` systemd unit
- installs the Nginx site and enables it

If your Django backend is not on the same droplet, set `API_ORIGIN` to the actual backend origin before bootstrapping.

## First deploy and later updates

When local client changes are ready to publish:

```bash
./client/deploy/deploy_to_droplet.sh 45.55.66.19
```

That command:

- rsyncs the `client/` directory to a new release directory on the droplet
- runs `npm ci`
- runs `npm run build`
- flips `/opt/battlestats-client/current` to the new release
- restarts `battlestats-client`

## Runtime config

The droplet reads runtime variables from `/etc/battlestats-client.env`.

Current supported values:

```env
BATTLESTATS_API_ORIGIN=http://127.0.0.1:8888
NEXT_PUBLIC_GA_MEASUREMENT_ID=
```

After editing that file on the droplet:

```bash
systemctl restart battlestats-client
```

## Service checks

Useful remote commands:

```bash
ssh root@45.55.66.19 'systemctl status battlestats-client --no-pager'
ssh root@45.55.66.19 'journalctl -u battlestats-client -n 100 --no-pager'
ssh root@45.55.66.19 'nginx -t && systemctl status nginx --no-pager'
```

## SSL later

This bootstrap uses plain HTTP on port 80 so the client is reachable immediately by IP.

When you are ready to attach a domain, add TLS with Certbot or another reverse-proxy/TLS layer. That is the point where automation via GitHub Actions becomes more reasonable, but it is not required for the first deployment.
