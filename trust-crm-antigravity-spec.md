# Trust CRM — Build Specification for Antigravity IDE

**Purpose of this document:** Feed this to an AI coding agent (Antigravity IDE) to rebuild the Trust CRM cleanly, using the attached `trust-crm-supabase.zip` as the reference/starting point. The agent should treat the zip as scaffolding — reuse what's correct, fix/refactor what's incomplete, and complete all unfinished scope below.

---

## 1. Product Requirements (PRD)

### 1.1 Background
A religious/charitable trust needs a CRM to track all money movement — donations coming in and expenses going out — across both **cash** and **digital** payment modes. The system must also automatically notify designated people (via email + Telegram) whenever a transaction is recorded, and send an automatic monthly financial summary report.

### 1.2 Users & Roles
| Role | Count | Permissions |
|---|---|---|
| Admin | 1 | Full access: create/edit/delete everything, manage users, manage contacts, manage categories |
| Accountant | Many | Create/edit donors, transactions, contacts. Cannot delete records. Cannot manage users. |
| Viewer | Optional | Read-only access to dashboard and records |

### 1.3 Core Entities
- **Profiles** — linked to Supabase Auth users, holds `role`
- **Contacts** — people who can be notified: name, email, Telegram chat ID, phone, `subscribe_monthly_report` flag
- **Categories** — expense/income categories (Donation, Maintenance, Salaries, etc.)
- **Transactions** — single unified ledger table:
  - `type`: `credit` (money in) or `debit` (money out)
  - `mode`: `cash` or `digital`
  - `digital_method`: upi / bank_transfer / card / cheque / other (only if mode=digital)
  - `amount`, `category_id`, `party` (donor/vendor name), `reference_no`, `description`, `txn_date`
  - `notify_contact_ids`: array of Contact IDs to notify on save
  - `notification_status`: pending / sent / partial / failed

### 1.4 Functional Requirements

**FR-1 — Ledger tracking**
System must record every donation and every expense, tagged by payment mode (cash/digital) and digital sub-method, with running balances calculated separately for cash-in-hand and digital balance.

**FR-2 — Role-based access**
1 admin account with full control; unlimited accountant accounts with create/edit rights; optional read-only viewer accounts. Enforced via Postgres Row Level Security (RLS), not just frontend checks.

**FR-3 — Instant notifications (MANDATORY, core scope)**
When any transaction (credit or debit) is created, the user creating it selects one or more Contacts from a fixed contact list. The system immediately sends:
  - An email (via Gmail SMTP) to each selected contact's email, AND
  - A Telegram message (via Telegram Bot API) to each selected contact's chat ID
  containing: type, amount, mode, party, date, description.
  Delivery status (sent/partial/failed) is stored back on the transaction record.

**FR-4 — Automatic monthly report (MANDATORY, core scope)**
On the 1st of every month at 08:00 server time, a scheduled job aggregates the previous month's transactions (total credit, total debit, net, cash in/out, digital in/out, transaction count) and sends this summary via email + Telegram to every Contact with `subscribe_monthly_report = true`. Must also be manually triggerable via an API endpoint for testing.

**FR-5 — Contact management**
Admin/accountant can add/edit contacts with name, email, Telegram chat ID, phone, and a checkbox for monthly report subscription. This is a fixed, reusable list — not re-entered per transaction.

**FR-6 — Dashboard**
Shows: cash-in-hand, digital balance, opening balance, total credit, total debit, breakdown by mode, at a glance.

### 1.5 Non-Functional Requirements
- Backend: Node.js/Express + Supabase (Postgres) — service-role key never exposed to frontend
- Frontend: React (Vite) + Tailwind, calling backend REST API; auth handled directly via Supabase Auth (JWT passed to backend for verification)
- RLS enforced at database level for all role permissions
- Must deploy: frontend → Vercel, backend → Render/Railway (persistent Node process required for cron), DB → Supabase

### 1.6 Out of Scope (for this phase)
- File/receipt upload for proof-of-payment images
- Donor-facing portal
- SMS notifications
- Multi-currency support beyond INR display formatting

---

## 2. Reference Materials Provided to Agent

Attach/provide these to the Antigravity agent alongside this spec:
1. `trust-crm-supabase.zip` — existing partial implementation (backend Express+Supabase API, frontend React+Vite). Contains working: schema.sql, auth middleware, transactions/contacts/dashboard routes, notify service (nodemailer+Telegram), monthly cron, and matching frontend pages (Login, Dashboard, Transactions, Contacts).
2. This spec document.

**Agent instruction:** Do not discard the zip. Review it first, validate each file against the requirements in Section 1, keep what's correct, and fix/extend anything incomplete per the task checklist below.

---

## 3. Task Checklist (execute in order)

### Phase 0 — Setup & Audit
- [ ] Unzip `trust-crm-supabase.zip` and review `backend/` and `frontend/` structure
- [ ] Run `npm install` in both `backend/` and `frontend/`
- [ ] Confirm `backend/src/server.js` boots without errors using placeholder `.env` values
- [ ] Confirm `frontend` builds via `npm run build` without errors
- [ ] Diff current schema (`backend/supabase/schema.sql`) against Section 1.3 entities — note any gaps

### Phase 1 — Database (Supabase)
- [ ] Create/confirm Supabase project
- [ ] Run `schema.sql` in Supabase SQL Editor
- [ ] Verify tables exist: `profiles`, `contacts`, `categories`, `transactions`, `cash_settings`
- [ ] Verify views exist: `v_cash_summary`, `v_digital_summary`
- [ ] Verify RLS policies match Section 1.4 FR-2 (admin/accountant/viewer permissions) — test with a non-admin user that they cannot delete records
- [ ] Confirm `handle_new_user()` trigger auto-creates a `profiles` row on signup, defaulting to `accountant`
- [ ] Manually promote the first signed-up user to `role='admin'`

### Phase 2 — Backend API
- [ ] Verify `/api/transactions` (GET/POST/PATCH/DELETE) enforce role checks per FR-2
- [ ] Verify `/api/contacts` (GET/POST/PATCH/DELETE) enforce role checks
- [ ] Verify `/api/dashboard/summary` returns cash + digital summary correctly
- [ ] **Notification hook (FR-3):** confirm `POST /api/transactions` triggers `notifyContactsOfTransaction()` for every ID in `notify_contact_ids`, sends email via `sendEmail()` and Telegram via `sendTelegram()`, and writes back `notification_status`
- [ ] Add input validation: reject transactions with `amount <= 0`, reject missing `type`/`mode`
- [ ] **Monthly cron (FR-4):** confirm `node-cron` schedule `0 8 1 * *` is registered on server start; confirm `generateAndSendMonthlyReport()` correctly queries previous calendar month, aggregates figures, and sends to all `subscribe_monthly_report=true` contacts
- [ ] Confirm manual trigger endpoint `POST /api/reports/monthly/send-now` works for testing
- [ ] Add basic error logging for failed email/Telegram sends (do not fail the whole request if one contact's notification fails — use `Promise.all` with per-contact try/catch, already scaffolded in `notify.js`)

### Phase 3 — Frontend
- [ ] Login page: Supabase email/password auth working, redirects to `/dashboard` on success
- [ ] Dashboard: renders cash-in-hand, digital balance, opening balance, in/out breakdown from `/api/dashboard/summary`
- [ ] Transactions page:
  - [ ] List view shows date, type (credit/debit badge), party, amount, mode, notification status
  - [ ] "Add Transaction" form: type toggle (credit/debit), amount, party, mode toggle (cash/digital), digital sub-method dropdown (if digital), description, date
  - [ ] **Contact picker (FR-3):** checkbox list of existing Contacts to select who gets notified — must load from `/api/contacts`
- [ ] Contacts page:
  - [ ] List view shows name, email, Telegram chat ID, monthly report subscription status
  - [ ] "Add Contact" form: name, email, Telegram chat ID, phone, subscribe-to-monthly-report checkbox
- [ ] Role-aware UI: hide delete buttons / admin-only actions for non-admin roles (backend RLS is the real enforcement; this is UX only)
- [ ] Nav sidebar: Dashboard / Transactions / Contacts / Logout

### Phase 4 — Notification Channel Setup (credentials, not code)
- [ ] Gmail: generate an App Password (Google Account → Security → 2-Step Verification → App Passwords)
- [ ] Telegram: create bot via @BotFather, obtain bot token
- [ ] For each Contact who should get Telegram messages: have them message the bot once, then fetch `https://api.telegram.org/bot<TOKEN>/getUpdates` to read their `chat_id`, and enter it in the Contact record

### Phase 5 — Environment Configuration
- [ ] `backend/.env`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SMTP_USER`, `SMTP_PASS`, `TELEGRAM_BOT_TOKEN`, `PORT`
- [ ] `frontend/.env`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL`
- [ ] Confirm `.env` files are gitignored; only `.env.example` committed

### Phase 6 — Testing
- [ ] Create a test credit transaction with 1+ notify contacts → confirm email arrives, confirm Telegram message arrives, confirm `notification_status='sent'` in DB
- [ ] Create a test debit transaction the same way
- [ ] Trigger `POST /api/reports/monthly/send-now` → confirm report email + Telegram message received by all subscribed contacts, with correct aggregated figures
- [ ] Test role enforcement: log in as accountant, confirm delete actions are rejected (403) by API
- [ ] Test dashboard figures update correctly after adding transactions

### Phase 7 — Deployment
- [ ] Push final code to GitHub
- [ ] Deploy `backend/` to Render or Railway as a persistent Node web service (not serverless — cron requires a long-running process); set all backend env vars there
- [ ] Deploy `frontend/` to Vercel; root directory `frontend`; set all `VITE_*` env vars, with `VITE_API_URL` pointing to the deployed backend
- [ ] Confirm production login, transaction creation, and notifications all work end-to-end
- [ ] Confirm cron fires correctly in production (check Render logs on the 1st of the next month, or temporarily adjust the cron schedule to test sooner, then revert to `0 8 1 * *`)

---

## 4. Definition of Done
- All checkboxes in Section 3 are complete
- A transaction created by any accountant triggers real email + Telegram notifications to selected contacts within seconds
- The monthly report sends automatically without manual intervention, and is verified once via the manual trigger endpoint
- Admin can manage users' roles; accountants cannot delete records; RLS blocks unauthorized actions at the database level, independent of frontend
- App is live on Vercel (frontend) + Render/Railway (backend) + Supabase (database)
