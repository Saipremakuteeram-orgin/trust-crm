# Trust CRM — Audit Checklist

Run date: 2026-11-11 · Scope: every UI feature ↔ API route ↔ migration, security boundaries, backup pipeline.

Legend: ✅ verified working · 🔧 defect found and fixed · ⚠️ known gap (not fixed)

## Verification run

| Check | Result |
| --- | --- |
| Frontend unit tests | ✅ 7/7 pass |
| Backend tests | ✅ 68/68 pass (3 new backup regression tests) |
| Frontend lint (oxlint) | ✅ 0 errors, 136 warnings (was 141) |
| Frontend production build | ✅ passes |
| Backend `node --check` on edited files | ✅ passes |
| Every `api.*()` call in the UI resolved to a mounted backend route | ✅ after fixes |

No live Supabase / Telegram credentials were used, so behaviour against the real
database was verified by source trace only.

---

## 1. Feature checklist

| Feature | What was checked | Status |
| --- | --- | --- |
| Dashboard | `/dashboard/summary`, `/dashboard/recurring-commitment`, `/dashboard/opening-balance` mounted | ✅ |
| Transactions | CRUD + receipt upload/download routes present; receipt download stays server-side (bot token never leaves backend) | ✅ |
| Recurring transactions | CRUD, `run-now`, cron started in `server.js` | ✅ |
| Contacts / Groups | CRUD, bulk preview/confirm, per-group membership routes | ✅ |
| Users / Activity log | Admin-gated, role/reset/invite/sync routes, self-delete/self-role guards | ✅ |
| Chart of Accounts / Trial Balance | `/accounts`, `/accounts/trial-balance` both mounted | ✅ |
| Journal Entries | CRUD + `/journal-entries/:id/post` | ✅ |
| General Ledger | Nav pointed at `/ledger` while only `/ledger/:accountId` existed → fell through to dashboard redirect | 🔧 added `/ledger` route + account picker |
| Trustees / Beneficiaries | CRUD + disbursements routes all match the UI | ✅ |
| Compliance | CRUD + returns; alert cron now de-duplicated | 🔧 daily cron inserted one duplicate per item per day |
| Donation Receipts | CRUD worked, but `campaign_id` could never be set, so Campaign totals were dead | 🔧 `campaign_id` accepted/updated in API + selector and column in Receipts UI |
| Bank Reconciliation | Statements, items, unmatched transactions routes present | ✅ |
| Functions & Budget | CRUD, categories/items, status, budget-variance | ✅ |
| Spreadsheet / Reports / Scheduled reports | Export + generate + preview/send-now routes present | ✅ |
| Mail (compose, sent, inbox) | Routes present; inbound webhook was unauthenticated (see security) | 🔧 hardened |
| File Send | Send + logs present; filenames now sanitized | 🔧 |
| Common Drive | MIME allowlist, path validation on list/upload/rename/download | ✅ |
| Backup & Restore | Manual run reported success when nothing was stored; new tables never backed up | 🔧 see §3 |
| Events | Backend had registration endpoints the UI never called; no capacity/duplicate checks; no edit; delete shown to accountants | 🔧 full registration UI, status workflow, edit, 409 checks, permission split |
| Campaigns | PATCH endpoint unreachable (no edit UI), status unchangeable, delete shown to accountants | 🔧 edit modal, status control, funding link, permission split |
| Volunteers | PATCH unreachable; `volunteer_shifts` table has no API | 🔧 edit added · ⚠️ shifts API/UI not built |
| Assets | PATCH unreachable | 🔧 edit added |
| Security (2FA) | TOTP could be enrolled but was never challenged at login; abandoned enrollment blocked re-enroll; missing challenge error handling | 🔧 MFA gate + enrollment recovery |
| Notifications | Daily compliance alerts duplicated; clicking an item did nothing; `link` ignored | 🔧 de-dupe + click marks read and navigates |
| Operations module | Feature-flagged, covered by existing tests; not deeply re-audited this run | ✅ (tests) |

---

## 2. Security checklist

| # | Issue | Boundary / impact | Fix | Status |
| --- | --- | --- | --- | --- |
| S1 | `POST /api/mail/webhook` skipped signature checks entirely when the signature header was absent, and used a non-Resend hex scheme | Unauthenticated internet → insert arbitrary inbox rows (inbox injection) | Fail closed when `RESEND_WEBHOOK_SECRET` missing; verify Svix `svix-id`/`svix-timestamp`/`svix-signature` with HMAC-SHA256 over raw body, timing-safe compare, 5-minute replay window; raw body captured in `express.json` verify hook | 🔧 |
| S2 | `/wa` WebSocket upgrade handler bypassed Express auth (`requireAuth` never runs on `upgrade`) | Unauthenticated → open tunnel through the shared WhatsApp session | Upgrade now requires `?token=` and validates it via Supabase before connecting | 🔧 |
| S3 | MFA enforced only in the browser; API accepted password-only (aal1) tokens even after TOTP enrollment | Stolen password → full API access despite 2FA | `requireAuth` decodes the JWT `aal` claim and rejects aal1 tokens for users with a verified factor (403 `mfa_required`, 60s cache, fail-open on IdP error); frontend refreshes and re-gates | 🔧 |
| S4 | Inbox search interpolated raw input into a PostgREST `.or()` filter | Filter/operator injection (authenticated) | Strip `, ( ) % * \ "` and cap length | 🔧 |
| S5 | Upload filenames used verbatim in storage keys and emails (`fileSend`, `mail`) | Path/name injection into object keys and HTML | Both routes now use `sanitizeFileName()` | 🔧 |
| S6 | Secrets handling | No tracked `.env`; no hardcoded keys found; service-role key is backend-only | ✅ | ✅ |
| S7 | Live WhatsApp bot token in download URLs | Token appears in `getTelegramFileUrl()`; verified it is only used server-side in `transactions.js` and never returned to a client | ✅ | ✅ |
| S8 | CORS | Pinned to configured origins + localhost; credentials scoped correctly | ✅ | ✅ |
| S9 | Route auth coverage | All CRM routers call `requireAuth`; only webhook/proxy modules do not (they authenticate per-request) | ✅ | ✅ |
| S10 | Drive path traversal / MIME | `isSafePath`, `..` rejection, MIME allowlist, 50 MB cap | ✅ | ✅ |
| S11 | Mass assignment | Only Operations routes spread `req.body`, through their validated service layer; CRM routes pick fields explicitly | ✅ | ✅ |
| S12 | **Supabase RLS gaps.** Migrations 021–025 (events, event_registrations, notifications, campaigns, volunteers, volunteer_shifts, assets) never enabled row level security, and legacy tables granted `SELECT` to any authenticated user. The public anon key ships in the browser, so those tables were reachable directly through PostgREST, bypassing all backend role checks | Public anon key → read/write CRM data outside the API | New `026_rls_lockdown.sql`: drops the permissive policies, enables RLS on every public table, revokes table/sequence privileges and default privileges from `anon`/`authenticated`, and grants back only `SELECT` on the caller's own `profiles` row (the one direct read the UI makes). Service-role backend access is unaffected. Bundles regenerated | 🔧 |

### Residual risks (needs a decision, not a code patch)

- ⚠️ **MFA policy detection** relies on `admin.mfa.listFactors` with a 60s cache and fails open if the IdP call errors. A hard fail-closed policy would need a local `mfa_required` flag on `profiles`.
- ⚠️ **CSP is disabled** (`contentSecurityPolicy: false`) and the WhatsApp proxy deliberately strips upstream security headers. Enabling CSP requires tuning for the proxied frame.
- ⚠️ **Inbox/mail logs are readable by every authenticated role**, including `viewer`.
- ⚠️ **Webhook secret is a static shared secret** with no timestamp/replay protection (unlike the mail webhook now).

---

## 3. Backup checklist (why daily backups were not really happening)

| Issue | Why it mattered | Fix | Status |
| --- | --- | --- | --- |
| Success logged even when Telegram upload failed or was unconfigured | `backup_logs` said `success`, so the 4-hourly health-check cron never retried. This is the most likely root cause of "backup is not properly happening". | A run now **fails** unless the workbook was actually delivered; the reason is stored in `error_message` | 🔧 |
| Row-count "verification" compared a value with itself | Corruption/truncation could never be detected | Counts data rows in the generated workbook and aborts on mismatch | 🔧 |
| Table read errors were swallowed | Partial backup reported as complete | Any unreadable table now fails the run with the table list | 🔧 |
| Events, registrations, campaigns, volunteers, shifts, assets were not in the backup list | Newer features were never backed up at all | Added to `TABLES` + `DATA_TABLES` | 🔧 |
| No concurrency guard | Cron runs per instance / overlapping runs → duplicate uploads and stacked work | Skips when a run started <30 min ago is still `running`; stale `running` logs are marked failed | 🔧 |
| Free-tier sleep missed the 06:00 cron | No backup for the day until a manual run | Startup recovery: if there is no success today and it is ≥07:00 IST, run a recovery backup 2 minutes after boot | 🔧 |
| `run-now` returned HTTP 200 even on failure | Admin could not see that a manual backup failed | Returns HTTP 500 with the reason | 🔧 |
| Filename used UTC date, log used IST date | Morning run near midnight could mislabel | Filename uses IST date | 🔧 |
| Startup hour computed by re-parsing a localized string | Fragile `≥07:00` gate | Uses `Intl.DateTimeFormat` with `hourCycle: h23` | 🔧 |
| Verification had no regression coverage | The silent-success bug could return | `assertBackupComplete()` extracted and covered by 3 unit tests (complete, missing rows, undelivered) | 🔧 |

**Action required from you (two deploy steps):**

1. Apply `backend/src/migrations/026_rls_lockdown.sql` to Supabase (or run the
   migration runner / `supabase/combined-schema.sql` on a clean database). Until
   it is applied, the RLS finding S12 stays open in the live database.
2. Confirm `TELEGRAM_BOT_TOKEN` and `TELEGRAM_STORAGE_CHAT_ID` are set on the
   deployed service (both are `sync: false` in `render.yaml`). Backups now fail
   loudly instead of silently succeeding when they are missing. Health-check
   retries run at 08:00, 12:00, 16:00 and 20:00 IST, and a missed 06:00 run is
   recovered shortly after the service next wakes.

---

## 4. Files changed in this audit

Backend: `server.js`, `middlewares/auth.js`, `routes/mail.js`, `routes/fileSend.js`,
`routes/whatsappProxy.js`, `routes/backup.js`, `routes/events.js`,
`routes/receipts.js`, `services/backup.js`, `cron/complianceAlerts.js`.

Frontend: `App.jsx`, `lib/api.js`, `components/Header.jsx`, `components/MfaGate.jsx` (new),
`pages/Events.jsx`, `pages/Campaigns.jsx`, `pages/Volunteers.jsx`, `pages/Assets.jsx`,
`pages/Security.jsx`, `pages/Receipts.jsx`, `pages/GeneralLedger.jsx`.

Skill installed: `.agents/skills/security-audit` (cloudflare/security-audit-skill).
