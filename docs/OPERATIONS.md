# Operations Runbook

Day-2 operations for the WSchools Fee Management System.

---

## Backups

Backups are consistent copies of the SQLite database (`data/college.sqlite`),
stored in `backups/`. They are **AES-256-GCM encrypted at rest** when
`BACKUP_ENCRYPTION_KEY` is set.

### On demand (UI)
Sign in as Super Admin → **Backup & Restore** → *Create Backup Now*. You can
download or delete snapshots there.

### On demand (CLI)
```bash
npm run backup:create
```

### Daily automated backups (cron)
```cron
# 2:00 AM every day — matches the brain-chart backup window.
0 2 * * * cd /opt/wschools && /usr/bin/npm run backup:create >> logs/backup.log 2>&1
```
Old snapshots are pruned automatically per **Settings → Backup →
retention days** (default 30). Adjust for your compliance needs (e.g. 7 years).

### Restore
Stop the server first, then:
```bash
npm run restore -- backup-2026-07-13T02-00-00-000Z.sqlite       # plain
npm run restore -- backup-....sqlite.enc                        # encrypted (needs the key)
```
A safety snapshot of the current DB is taken automatically before restoring.
Restart the server afterwards.

> **Test restores periodically** (the brain-chart recommends monthly). Restore a
> recent backup into a staging copy and confirm the data looks right.

---

## Health & monitoring

- **Liveness/readiness:** `GET /health` (and `/healthz`) return JSON with
  `status`, `database`, `uptime_seconds`, `version`. HTTP 200 = healthy,
  503 = database problem. Point your uptime monitor / load balancer here.
- **Logs:**
  - systemd: `journalctl -u wschools -f`
  - pm2: `pm2 logs wschools-fees` (files under `logs/`)
  - docker: `docker compose logs -f app`

---

## Audit log

Every significant action (create/update/delete, logins, payments, backups) is
recorded with the user, IP address, timestamp and before/after values. View it
as Super Admin under **Audit Logs**, filterable by action and table.

---

## Security operations

- **Secrets:** keep `SESSION_SECRET`, `ADMIN_PASSWORD` and
  `BACKUP_ENCRYPTION_KEY` out of source control (use `.env` / the process
  environment). Rotate them if exposed.
- **Rate limiting:** the app throttles requests per IP (global) and login
  attempts (stricter), and locks an account after repeated failures. No action
  needed; tune the numbers in `src/middleware/rateLimit.js` if required.
- **TLS:** always run behind HTTPS in production (nginx sample provided) and set
  `TRUST_PROXY=1` so secure cookies work.
- **Headers/CSP:** security headers and a strict Content-Security-Policy are set
  automatically (`src/middleware/security.js`).

---

## Upgrades

```bash
git pull
npm ci --omit=dev            # install any dependency changes
npm run migrate              # apply schema changes (safe / idempotent)
# restart via systemd / pm2 / docker
```
The schema uses `CREATE TABLE IF NOT EXISTS`, so `migrate` is safe to re-run and
never drops data.

---

## Disk & data

- The whole dataset is the single file `data/college.sqlite` (plus `-wal`/`-shm`
  sidecars while running). Backing up = copying that file (which the backup tools
  do consistently after a WAL checkpoint).
- Uploaded bills/photos live in `public/uploads/`. Include this folder in your
  off-box backup strategy alongside the database.

---

## Troubleshooting

| Symptom | Check |
|---|---|
| Server won't start in production | Insecure defaults — set `SESSION_SECRET` / `ADMIN_PASSWORD` in `.env`. |
| `/health` returns 503 | Database file missing or unreadable; check `DATABASE_FILE` and permissions. |
| Login says "too many attempts" | Rate limit / lockout — wait a few minutes or check for a brute-force source. |
| Uploads fail | `public/uploads/` not writable, or file exceeds 5 MB. |
| Secure cookie not set behind proxy | Set `TRUST_PROXY=1` and ensure nginx sends `X-Forwarded-Proto`. |
