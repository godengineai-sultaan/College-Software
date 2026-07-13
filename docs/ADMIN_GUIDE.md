# Administrator & Staff Guide

A practical, task-oriented guide to running the WSchools Fee Management System.
No technical knowledge required.

---

## Signing in

Open the app in a browser and sign in with your **username** and **password**.
What you see depends on your role:

| Role | Can do |
|---|---|
| **Super Admin** | Everything, across both branches, plus Users, Settings, Branches, Backup. |
| **Branch Admin** | Run their branch: students, fees, collection, exam forms, structures, expenses, reports. |
| **Accountant** | Fees, collection, receipts, fee structures, expenses, reports (their branch). |
| **Receptionist** | Front-desk fee collection & student records (their branch); can take cross-branch payments. |
| **Viewer** | Read-only across all branches. |

Change your password any time under **My Profile → Change password**.

---

## First-time setup (Super Admin)

Do these once before staff start using the system:

1. **Settings** — set institution name, address, currency, academic year, and
   fee/late-fee/discount rules.
2. **Branches** — confirm/edit your two campuses (A and B).
3. **Courses & Fee Heads** — add your courses (e.g. B.Com, BCA) and the fee
   heads you charge (Tuition, Library, Exam…).
4. **Fee Structure** — for each course & semester, add the head amounts, due
   dates and late-fee rate.
5. **Users** — create accounts for your staff and assign each a role and branch.
   Then remove or disable the demo accounts.

---

## Daily workflows

### Admitting a student
**Students → Add Student.** Fill in the details and save — a unique ID
(e.g. `COL-A-26-0001`) is generated automatically and the student's fee ledger
is created from the course/semester fee structure.

**Bulk admissions:** **Students → Bulk Upload.** Download the CSV template, fill
one student per row (Excel → *Save As* → CSV), and upload. The system validates
every row (required fields, valid course code, duplicates) and shows a report of
what was imported, skipped or errored.

### Collecting a fee (the core task)
**Fee Collection** → search the student by name, ID or phone →

1. Review their outstanding dues (shown head-wise, with any late fee).
2. Enter the amount and choose the payment mode (Cash, Card, UPI, Net Banking,
   Cheque, DD).
3. Click **Collect & Generate Receipt**.

The payment is split across the oldest dues automatically, a receipt
(`REC-A-26-000001`) is created, and (if enabled) an SMS confirmation is queued.
Click **Print / PDF** to print or save the receipt.

**Cross-branch:** a receptionist at Branch A can collect for a Branch B student —
the system detects it, records the receipt at Branch A, and mirrors it to the
student's branch ledger. It's clearly marked *Cross-Branch*.

### Receipts
**Receipts** lists every payment with filters (date, mode, branch, cross-branch).
Open one to view/print it, or cancel it (Accountant/Admin) — cancelling restores
the student's dues.

### Discounts
**Discounts → Request Discount.** Enter the student ID, fee head, amount and
reason. Small discounts can auto-approve; larger ones wait for an Admin to
**Approve/Reject**. Approved discounts reduce the student's payable.

### Exam forms
**Exam Forms → New.** Choose the student and type (Regular / Backlog /
Improvement), session and fee. Track each form's progress and advance its status.

### Expenses
**Expenses → Add Expense.** Record spending with a category, amount, payee and an
optional scanned bill. A voucher number (`VCH-A-26-0001`) is generated. The list
shows **Net Collection = Collections − Expenses**.

### Reminders & notifications
**Notifications → Send Fee Reminders** messages all students with pending dues.
You can also compose a one-off message. (Real SMS/Email requires configuring a
gateway under **Settings → Notifications**; otherwise messages are logged.)

---

## Reports & exports

- **Reports & Analytics** — live dashboard: collections, expenses, net,
  outstanding, trends, payment-mode split, fee-status breakdown, **defaulters**,
  and branch comparison. Print any report.
- **Data Merge & Export** — download a **6-sheet consolidated Excel** (Students,
  Fee Ledger, Receipts, Expenses, Exam Forms, Reconciliation) or per-area CSVs,
  filtered by branch and date range.

---

## Housekeeping (Super Admin)

- **Users** — add/edit staff, reset passwords, deactivate accounts.
- **Audit Logs** — see who did what, when, and from where.
- **Backup & Restore** — create a backup before big changes; schedule daily
  backups (see OPERATIONS.md).
- **Settings** — change branding, fee rules and gateway keys any time.

---

## Tips

- Deleting a student **moves them to Trash** (Students → Trash) — you can restore
  them; nothing is lost by accident.
- Use the **branch filter** (top of lists) to focus on one campus.
- Everything configurable — fee heads, structures, courses, rules — lives under
  the menus above, so you can adapt the system yourself as needs change.
