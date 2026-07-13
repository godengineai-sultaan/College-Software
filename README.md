# WSchools — Dual-Branch College Fee Management System

A complete, self-hosted **college fee management system** built to be handed over
to a client and run end-to-end by non-technical staff. It implements the full
brain-chart: two branches with a sync engine, six user roles, auto-generated IDs,
head-wise fee collection (including **cross-branch payments**), receipts, exam
forms, expenses, reports & analytics, consolidated Excel export, notifications,
audit logging and backups.

> Built with **Node.js + Express + EJS + SQLite** — one language across the whole
> app, simple templates the client's team can edit, and a **single-file, zero-setup
> database**. `npm install && npm start` and it runs on Windows, macOS or Linux.
> No database server, no build step, nothing to compile.

---

## Table of contents
- [Features (mapped to the 10 modules)](#features)
- [Quick start](#quick-start)
- [Default logins](#default-logins)
- [User roles & permissions](#user-roles--permissions)
- [How the money flow works](#how-the-money-flow-works)
- [Configuration](#configuration)
- [Project structure](#project-structure)
- [Backups](#backups)
- [Security](#security)
- [Moving to MySQL/PostgreSQL later](#scaling-up)
- [Deployment](#deployment)

---

## Features

| # | Module | What it does |
|---|--------|--------------|
| **M1** | **Auth, RBAC & Sync** | Secure login (bcrypt + sessions), 6 roles, branch scoping, cross-branch two-phase sync log |
| **M2** | **Student Lifecycle** | CRUD, auto ID `COL-A-26-0001`, **bulk CSV upload** with a validation engine, soft-delete & restore |
| **M3** | **Fee Structure** | Dynamic fee heads per course/semester, due dates, late-fee rules, discount workflow (request → approve) |
| **M4** | **Fee Collection** | Search → dues → **head-wise allocation** → 6 payment modes → receipt `REC-A-26-000001` → **cross-branch** |
| **M5** | **Exam Forms** | Regular / Backlog / Improvement forms with progress tracking |
| **M6** | **Expense Management** | Categories & sub-categories, bill upload, voucher `VCH-A-26-0001`, **Net Collection = Collections − Expenses** |
| **M7** | **Reports & Analytics** | Live dashboard, trend charts, payment-mode distribution, fee-status breakdown, defaulter list, branch comparison |
| **M8** | **Data Merge & Export** | One-click **6-sheet consolidated Excel** + CSV exports, cross-branch reconciliation |
| **M9** | **Security & Backup** | Audit logs (who/what/when/IP/old→new), one-click encrypted-ready DB backups with retention |
| **M10** | **Notifications** | SMS/Email/dashboard notifications, deadline reminders (pluggable Fast2SMS/MSG91/SMTP gateways) |

Everything the client needs to change day-to-day — institution name, fee heads,
fee structures, courses, branches, users, grading of discounts, gateway keys —
is editable **from the UI**, no code changes required.

---

## Quick start

Requirements: **Node.js 18+** (Node 22+ recommended). Nothing else.

```bash
# 1. Install dependencies
npm install

# 2. First-time setup: create the database + demo data
npm run setup

# 3. Start the server
npm start
```

Then open **http://localhost:3000** and sign in.

> The very first `npm start` will auto-run setup if the database is missing, so
> in most cases you can just run `npm install && npm start`.

Useful scripts:

| Command | Purpose |
|---------|---------|
| `npm start` | Run the web server |
| `npm run dev` | Run with auto-reload (Node `--watch`) |
| `npm run setup` | Create schema + seed demo data |
| `npm run migrate` | Apply the database schema only |
| `npm run seed` | Insert demo data (skips if data exists) |
| `npm run reset` | **Wipe** the database and rebuild it (destructive) |

---

## Default logins

After `npm run setup`, these demo accounts exist (change the passwords after first login):

| Role | Username | Password |
|------|----------|----------|
| Super Admin | `admin` | `Admin@123` |
| Branch Admin A | `admin_a` | `Admin@123` |
| Branch Admin B | `admin_b` | `Admin@123` |
| Accountant | `accountant` | `Account@123` |
| Receptionist | `reception` | `Reception@123` |
| Viewer | `viewer` | `Viewer@123` |

The Super Admin credentials come from `.env` (`ADMIN_EMAIL` / `ADMIN_PASSWORD`).

---

## User roles & permissions

Six roles, defined in [`src/config/permissions.js`](src/config/permissions.js) —
edit that one file to change who can access what.

- **Super Admin** — full access to everything, all branches, plus Users, Settings, Branches, Backup.
- **Branch Admin** — manages their branch: students, fees, collection, exam forms, structures, expenses, reports.
- **Accountant** — fees, collection, receipts, structures, expenses, reports (their branch).
- **Receptionist** — front-desk fee collection, student records, exam forms (their branch); can take **cross-branch** payments.
- **Viewer** — read-only across all branches.

**Branch scoping** is automatic: branch-scoped roles only ever see their own
branch's data; the two all-branch roles (Super Admin, Viewer) see everything and
can filter by branch.

---

## How the money flow works

A fee collection (matching brain-chart Data Flow #2):

1. **Search** a student by name / ID / phone (any branch).
2. See their **outstanding dues**, head-wise, with any live **late fee**.
3. Enter an amount + one of **6 payment modes** (Cash, Card, UPI, Net Banking, Cheque, DD).
4. The **fee engine allocates** the payment across outstanding heads, oldest due first.
5. A **receipt** is generated (`REC-<branch>-<yy>-<seq>`), printable / save-as-PDF.
6. If the student belongs to a **different branch** than the collecting desk, it's
   flagged **cross-branch**, recorded at the collecting branch, and a **two-phase
   sync** entry mirrors it to the student's branch ledger (visible in reports for
   reconciliation — no double counting).
7. A **payment-confirmation notification** is queued, and the action is **audited**.

The whole write is wrapped in a database transaction, so the receipt counter,
receipt, its line items and the ledger update all commit together.

---

## Configuration

Copy `.env.example` to `.env` and adjust:

```env
PORT=3000
NODE_ENV=production
SESSION_SECRET=<a-long-random-string>     # IMPORTANT: change this
DATABASE_FILE=data/college.sqlite
ADMIN_NAME=System Administrator
ADMIN_EMAIL=admin@college.edu
ADMIN_PASSWORD=Admin@123
```

Everything else — institution branding, currency symbol, ID prefixes, late-fee
rules, discount-approval thresholds, SMS/Email gateway keys, backup retention —
is edited live under **Settings** in the app.

### Notifications (optional)
Out of the box, notifications are **logged** (so the flow works without any keys).
To send real messages, enable and configure a gateway under **Settings → Notifications**:
- **SMS:** Fast2SMS or MSG91 (API key + sender ID)
- **Email:** SMTP or SendGrid

---

## Project structure

```
College-Software/
├── server.js               # entry point
├── src/
│   ├── app.js              # Express app wiring
│   ├── config/             # env config, permissions (RBAC), domain constants
│   ├── db/                 # connection, schema.sql, migrate, seed, reset
│   ├── middleware/         # auth/RBAC, sessions, flash, CSRF
│   ├── models/             # data access (branch, student, receipt, fee, ...)
│   ├── services/           # business logic (fee engine, collection, sync,
│   │                       #   notifications, stats, id generation, audit)
│   ├── controllers/        # one per module
│   ├── routes/             # one router per module (auto-mounted)
│   ├── utils/              # helpers, csv, excel, icons, uploads
│   └── views/              # EJS templates (layouts, partials, one folder/module)
├── public/                 # css, js, uploaded files
└── data/                   # the SQLite database (created at setup)
```

---

## Backups

Under **Backup & Restore** (Super Admin), create one-click backups of the database.
Backups are timestamped copies stored in `backups/`, with automatic retention
(configurable in Settings). For automated **daily** backups, schedule the app's
backup endpoint or copy `data/college.sqlite` with your OS scheduler (cron /
Task Scheduler). Restoring is as simple as replacing the database file.

---

## Security

- Passwords hashed with **bcrypt**.
- **Session** authentication with a persistent SQLite session store; login
  throttling (lockout after repeated failures).
- **CSRF protection** on every state-changing form.
- **Role-based access control** with branch scoping on every route.
- **Audit trail** of significant actions (user, IP, timestamp, before/after values).
- SQL uses **parameterised queries** throughout (no string concatenation).
- Set a strong `SESSION_SECRET` and run behind HTTPS in production
  (set `TRUST_PROXY=1` when behind a reverse proxy so secure cookies work).

---

## Scaling up

SQLite comfortably handles a college's fee operations. If you later need a
central server for multiple concurrent branches, the data layer is isolated in
[`src/db/connection.js`](src/db/connection.js) and the models — swap SQLite for
MySQL/PostgreSQL there, keeping the same `get/all/run/tx` helper API, and the
rest of the app is unchanged. The schema in
[`src/db/schema.sql`](src/db/schema.sql) maps directly to the brain-chart tables.

---

## Deployment

1. Copy the project to your server, run `npm install --omit=dev`.
2. Set `.env` (`NODE_ENV=production`, a strong `SESSION_SECRET`, `TRUST_PROXY=1` if applicable).
3. `npm run setup` (first time only).
4. Run `npm start` under a process manager (pm2, systemd) and put **Nginx** in
   front for HTTPS. That mirrors the brain-chart infrastructure (Nginx + Node.js).

---

Built for **WSchools** · Dual-Branch College Fee Management System.
