# Deployment Guide

WSchools Fee Management System — how to run it in production. Pick **one** of
the three options below. All of them serve the same app; they differ only in how
the Node process is supervised.

**Requirement:** Node.js **≥ 22.5** (the app uses Node's built-in `node:sqlite`).
No database server, no build step.

---

## 0. One-time preparation (all methods)

```bash
git clone -b main https://github.com/godengineai-sultaan/College-Software.git
cd College-Software
cp .env.example .env
```

Edit `.env` and set, at minimum:

```env
NODE_ENV=production
SESSION_SECRET=<a long random string>      # node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
ADMIN_PASSWORD=<your admin password>        # not the default
TRUST_PROXY=1                               # if behind nginx (options A/B)
```

> In production the server **refuses to start** if `SESSION_SECRET` or
> `ADMIN_PASSWORD` are still the defaults — this is intentional.

---

## Option A — Docker Compose (recommended)

```bash
# Edit the secrets in docker-compose.yml first, then:
docker compose up -d
docker compose logs -f app
```

- The database is created and seeded automatically on first boot.
- Data persists in the host `./data`, `./backups`, and `./uploads` folders.
- A container healthcheck hits `/health`.
- To put TLS in front, uncomment the `nginx` service and add certs under
  `./deploy/certs` (see `deploy/nginx.conf.sample`).

Update to a new version:

```bash
git pull && docker compose up -d --build
```

---

## Option B — systemd on a VM (Nginx + Node)

```bash
sudo useradd -r -s /bin/false wschools
sudo mkdir -p /opt/wschools && sudo chown wschools:wschools /opt/wschools
# copy the app into /opt/wschools, then:
cd /opt/wschools
sudo -u wschools npm ci --omit=dev
sudo -u wschools npm run setup          # first time only
sudo cp deploy/wschools.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now wschools
```

Then put Nginx in front for HTTPS:

```bash
sudo cp deploy/nginx.conf.sample /etc/nginx/sites-available/wschools
# edit server_name + cert paths, symlink into sites-enabled, then:
sudo nginx -t && sudo systemctl reload nginx
```

Logs: `sudo journalctl -u wschools -f`

---

## Option C — PM2

```bash
npm ci --omit=dev
npm run setup                 # first time only
pm2 start ecosystem.config.js --env production
pm2 save && pm2 startup       # run the printed command to enable boot-start
```

Logs: `pm2 logs wschools-fees` · Restart: `pm2 restart wschools-fees`

> SQLite is a single-file DB — run **one** instance (fork mode). To scale to
> multiple instances, migrate the data layer to MySQL/Postgres first (see the
> README "Scaling up" section).

---

## After deployment

1. Open the site and sign in as the admin.
2. Change the admin password (you'll be prompted if it was flagged).
3. Under **Settings**, set the institution name, branches, currency and fee rules.
4. Create real user accounts (Users) and remove/disable the demo accounts.
5. Set up **daily backups** — see [OPERATIONS.md](OPERATIONS.md).

Verify health any time: `curl https://your-domain/health`
