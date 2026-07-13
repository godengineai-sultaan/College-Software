-- ===========================================================================
-- WSchools — Dual-Branch College Fee Management System
-- Database schema (SQLite). Re-runnable: every statement uses IF NOT EXISTS.
-- Mirrors the brain-chart schema reference (users, students, fee_structures,
-- student_fees, receipts, receipt_items, expenses, exam_forms, audit_logs,
-- branches) with practical additions (counters, sync_log, notifications,
-- discount workflow, fee_heads, courses, settings).
-- ===========================================================================

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- Settings — editable key/value configuration (institution, rules, branding).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- Sequence counters — power gap-free auto IDs (COL-A-26-0001 etc.).
-- scope example: 'student:A:26', 'receipt:B:26', 'voucher:A:26'
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS counters (
  scope TEXT PRIMARY KEY,
  value INTEGER NOT NULL DEFAULT 0
);

-- ---------------------------------------------------------------------------
-- Branches — the two campuses (A and B) that share this system.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS branches (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  branch_code TEXT NOT NULL UNIQUE,            -- 'A' | 'B'
  name        TEXT NOT NULL,
  address     TEXT,
  phone       TEXT,
  email       TEXT,
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- Users & access control.
-- role: super_admin | branch_admin | accountant | receptionist | viewer
-- branch_id scopes a user to a branch (NULL = all branches, e.g. super_admin).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  email         TEXT,
  phone         TEXT,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'viewer',
  branch_id     INTEGER REFERENCES branches(id) ON DELETE SET NULL,
  status        TEXT NOT NULL DEFAULT 'active',    -- active | inactive
  must_change_password INTEGER NOT NULL DEFAULT 0,
  last_login_at TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Server-side session store.
CREATE TABLE IF NOT EXISTS sessions (
  sid        TEXT PRIMARY KEY,
  data       TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

-- ---------------------------------------------------------------------------
-- Academic years & courses.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS academic_years (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL UNIQUE,             -- e.g. "2025-2026"
  start_date TEXT,
  end_date   TEXT,
  is_current INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS courses (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL,               -- e.g. "B.Com", "BCA", "B.Tech CSE"
  code            TEXT NOT NULL UNIQUE,        -- e.g. "BCOM"
  duration_years  INTEGER NOT NULL DEFAULT 3,
  total_semesters INTEGER NOT NULL DEFAULT 6,
  description     TEXT,
  is_active       INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- Fee heads — the configurable fee components ("7 heads").
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fee_heads (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL UNIQUE,             -- Tuition, Library, Exam ...
  code       TEXT,
  is_active  INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- M2: Students — with unique auto ID, soft-delete, branch scoping.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS students (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  unique_id      TEXT UNIQUE,                  -- COL-A-26-0001
  name           TEXT NOT NULL,
  roll_no        TEXT,
  course_id      INTEGER REFERENCES courses(id) ON DELETE SET NULL,
  course_name    TEXT,                         -- denormalised for fast display
  semester       INTEGER NOT NULL DEFAULT 1,
  branch_id      INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  academic_year  TEXT,
  admission_date TEXT,
  gender         TEXT,
  dob            TEXT,
  category       TEXT,                         -- General/OBC/SC/ST (configurable)
  phone          TEXT,
  email          TEXT,
  address        TEXT,
  city           TEXT,
  state          TEXT,
  guardian_name  TEXT,
  guardian_phone TEXT,
  guardian_relation TEXT,
  photo          TEXT,
  status         TEXT NOT NULL DEFAULT 'active',  -- active | inactive | passed_out
  deleted_at     TEXT,                         -- soft delete (NULL = live)
  created_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- M3: Fee structures — dynamic heads per course/semester/year (per row = head).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fee_structures (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id      INTEGER REFERENCES courses(id) ON DELETE CASCADE,
  semester       INTEGER NOT NULL DEFAULT 1,
  fee_head_id    INTEGER REFERENCES fee_heads(id) ON DELETE SET NULL,
  fee_head       TEXT NOT NULL,                -- denormalised head name
  amount         REAL NOT NULL DEFAULT 0,
  due_date       TEXT,
  academic_year  TEXT,
  branch_id      INTEGER REFERENCES branches(id) ON DELETE CASCADE, -- NULL = all branches
  late_fee_per_day REAL NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- Student fee ledger — what each student owes / has paid, per structure line.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS student_fees (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id    INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  structure_id  INTEGER REFERENCES fee_structures(id) ON DELETE SET NULL,
  fee_head      TEXT NOT NULL,
  amount        REAL NOT NULL DEFAULT 0,       -- original amount due
  paid_amount   REAL NOT NULL DEFAULT 0,
  discount      REAL NOT NULL DEFAULT 0,
  late_fee      REAL NOT NULL DEFAULT 0,
  academic_year TEXT,
  semester      INTEGER,
  due_date      TEXT,
  status        TEXT NOT NULL DEFAULT 'unpaid', -- unpaid | partial | paid | waived
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- M4: Receipts & receipt items (head-wise allocation, cross-branch aware).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS receipts (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_no       TEXT UNIQUE,                -- REC-A-26-000001
  student_id       INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  student_branch_id INTEGER REFERENCES branches(id) ON DELETE SET NULL,
  amount           REAL NOT NULL DEFAULT 0,    -- total collected
  discount_total   REAL NOT NULL DEFAULT 0,
  late_fee_total   REAL NOT NULL DEFAULT 0,
  payment_mode     TEXT NOT NULL DEFAULT 'cash', -- cash|card|upi|netbanking|cheque|dd
  reference_no     TEXT,                        -- txn/cheque/DD reference
  branch_id        INTEGER REFERENCES branches(id) ON DELETE SET NULL, -- collecting branch
  cross_branch     INTEGER NOT NULL DEFAULT 0,
  remarks          TEXT,
  paid_on          TEXT NOT NULL DEFAULT (date('now')),
  collected_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status           TEXT NOT NULL DEFAULT 'active', -- active | cancelled
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS receipt_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_id  INTEGER NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
  sf_id       INTEGER REFERENCES student_fees(id) ON DELETE SET NULL,
  fee_head    TEXT NOT NULL,
  amount      REAL NOT NULL DEFAULT 0,
  discount    REAL NOT NULL DEFAULT 0,
  late_fee    REAL NOT NULL DEFAULT 0
);

-- ---------------------------------------------------------------------------
-- Discount workflow — request + approve/reject discounts.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS discounts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id   INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  sf_id        INTEGER REFERENCES student_fees(id) ON DELETE SET NULL,
  fee_head     TEXT,
  amount       REAL NOT NULL DEFAULT 0,
  reason       TEXT,
  status       TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  branch_id    INTEGER REFERENCES branches(id) ON DELETE SET NULL,
  requested_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  approved_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  decided_at   TEXT
);

-- ---------------------------------------------------------------------------
-- M6: Expenses — categories, sub-categories, bill upload, voucher no.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS expense_categories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  parent_id  INTEGER REFERENCES expense_categories(id) ON DELETE CASCADE,
  is_active  INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS expenses (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  voucher_no      TEXT UNIQUE,                 -- VCH-A-26-0001
  category        TEXT,
  sub_category    TEXT,
  amount          REAL NOT NULL DEFAULT 0,
  branch_id       INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  bill_attachment TEXT,
  expense_date    TEXT NOT NULL DEFAULT (date('now')),
  paid_to         TEXT,
  payment_mode    TEXT DEFAULT 'cash',
  notes           TEXT,
  created_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- M5: Exam forms — Regular / Backlog / Improvement, with progress tracking.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS exam_forms (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  form_no         TEXT UNIQUE,                 -- EXF-A-26-0001
  student_id      INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  exam_type       TEXT NOT NULL DEFAULT 'regular', -- regular | backlog | improvement
  session         TEXT,                        -- e.g. "May 2026"
  semester        INTEGER,
  subjects        TEXT,                        -- JSON / comma list (backlog subjects)
  fee_amount      REAL NOT NULL DEFAULT 0,
  paid            INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'submitted', -- draft|submitted|approved|paid|rejected
  progress        INTEGER NOT NULL DEFAULT 0,  -- 0-100 progress bar
  submission_date TEXT NOT NULL DEFAULT (date('now')),
  branch_id       INTEGER REFERENCES branches(id) ON DELETE SET NULL,
  created_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- M9: Audit logs — every significant action (user, IP, old/new values).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  username   TEXT,
  action     TEXT NOT NULL,                    -- INSERT | UPDATE | DELETE | LOGIN | ...
  table_name TEXT,
  record_id  INTEGER,
  old_value  TEXT,
  new_value  TEXT,
  ip_address TEXT,
  branch_id  INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- Sync Engine — cross-branch two-phase commit / mirroring ledger.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sync_log (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  txn_ref        TEXT,
  entity         TEXT,                         -- receipt | student_fee
  record_id      INTEGER,
  source_branch  TEXT,
  target_branch  TEXT,
  phase          TEXT NOT NULL DEFAULT 'prepare', -- prepare | commit | rolled_back
  status         TEXT NOT NULL DEFAULT 'pending', -- pending | committed | failed
  payload        TEXT,
  error          TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  committed_at   TEXT
);

-- ---------------------------------------------------------------------------
-- Notifications — SMS / Email / dashboard alerts + deadline reminders.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  channel        TEXT NOT NULL DEFAULT 'dashboard', -- sms | email | dashboard
  recipient      TEXT,
  recipient_name TEXT,
  subject        TEXT,
  message        TEXT,
  related_type   TEXT,
  related_id     INTEGER,
  status         TEXT NOT NULL DEFAULT 'queued',    -- queued | sent | failed | read
  provider       TEXT,
  branch_id      INTEGER,
  sent_at        TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_students_branch    ON students(branch_id);
CREATE INDEX IF NOT EXISTS idx_students_course     ON students(course_id);
CREATE INDEX IF NOT EXISTS idx_students_deleted    ON students(deleted_at);
CREATE INDEX IF NOT EXISTS idx_students_unique     ON students(unique_id);
CREATE INDEX IF NOT EXISTS idx_sf_student          ON student_fees(student_id);
CREATE INDEX IF NOT EXISTS idx_sf_status           ON student_fees(status);
CREATE INDEX IF NOT EXISTS idx_fs_course_sem       ON fee_structures(course_id, semester);
CREATE INDEX IF NOT EXISTS idx_receipts_student    ON receipts(student_id);
CREATE INDEX IF NOT EXISTS idx_receipts_branch     ON receipts(branch_id);
CREATE INDEX IF NOT EXISTS idx_receipts_date       ON receipts(paid_on);
CREATE INDEX IF NOT EXISTS idx_ri_receipt          ON receipt_items(receipt_id);
CREATE INDEX IF NOT EXISTS idx_expenses_branch     ON expenses(branch_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date       ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_examforms_student   ON exam_forms(student_id);
CREATE INDEX IF NOT EXISTS idx_audit_created       ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_notif_status        ON notifications(status);
