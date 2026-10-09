# `trust-crm` — Deep Analysis

**Analysed:** 2026-10-07 · **Scope:** this project only
**Substance:** 64,532 lines across 326 source files (JS/JSX/SQL/PY) · 1.08 GB on disk (99% build artifacts) · 151 commits, single author (`Saipremakuteeram`), 2026-07-17 → 2026-09-03 · `.git` only 1.2 MB (clean, no bloat)

A genuinely ambitious and largely well-built financial system. **Two findings need action today**, one of which lets anyone forge entries into the trust's ledger.

---

## 1. What it is

A financial management system for a charitable trust (Sri Sai Dharma Samrakshana Prema Kuteeram), replacing the "cash in a notebook / digital in a bank app" split with one ledger.

| Layer | Reality |
|---|---|
| Frontend | React 19 + Vite + Tailwind v4 + Framer Motion + Recharts, on Vercel. **23 desktop pages** + a full mobile app |
| Backend | Node 18 + Express on Render (`trust-crm-b8rn.onrender.com`), service-role Supabase client |
| DB | Supabase/Postgres, project ref `twgunjmacbfqqpjpgrjt` — **~30 tables, RLS enabled on every one** |
| Integrations | Resend + Gmail SMTP (mail), Telegram Bot (alerts **and backup storage**), Google Drive (service account), WhatsApp Web (Puppeteer), Razorpay (via the website) |
| Domain | CRUD for transactions, contacts/groups, functions & budgets, chart of accounts + double-entry journal, trustees, beneficiaries, compliance calendar, donation receipts, bank reconciliation, recurring transactions, scheduled reports, mail, Drive, backups |

**Verified working in production:** `GET /health` → `200 {"status":"ok"}`; `GET /api/transactions` without a token → **`401 Missing auth token`**. Auth is genuinely enforced.

---

## 2. 🔴 Finding 1 — the live webhook secret is in a public repo

**This is the most serious issue in the project.**

`backend/.env.example` — a **tracked** file in a **public** GitHub repo — contains the production shared secret, and the comment above it even labels it as the current value:

```
# CURRENT VALUE (generated 2026-08-31): 2ad2a2…aedbab
WEBHOOK_SECRET=2ad2a2…aedbab
```

Evidence chain:

| Check | Result |
|---|---|
| Is `backend/.env.example` tracked? | **Yes** (`git ls-files`) |
| Is the repo public? | **Yes** — `api.github.com/repos/Saipremakuteeram-orgin/trust-crm` → HTTP 200 |
| Commit that introduced it | `b2b6923`, present on **`origin/main`** (`git branch -r --contains`) |
| Does the live value match? | `.hermes/plans/…-website-crm-donation-contact-bridge.md` records the working live secret as `2ad2a2…bab` — **exact match** |
| Is a secret actually loaded on the server? | **Yes** — I POSTed to the production webhook with a bogus key and got **`401 Unauthorized`** (if unset it returns `500 "Webhook secret not configured"`) |

### Why it matters

That secret authenticates three unauthenticated-by-design endpoints. Anyone who reads the public repo can call them directly:

| Endpoint | What an attacker can do |
|---|---|
| `POST /api/webhooks/website-donation` | Insert **arbitrary credit (income) rows** into the trust's ledger — `amount`, `party`, `description`, `reference_no` all attacker-controlled. Money that was never donated appears as income |
| `POST /api/webhooks/website-contact` | Inject/pollute the contact registry, including `enabled`/`subscribe_monthly_report` flags |
| `POST /api/webhooks/website-event` | Create budget Functions |

For a charity's accounting system this is a **ledger-integrity / fraud** exposure, and it corrupts records that feed receipts, monthly reports and (per the plan docs) donor-facing data. The code itself is well written — timing-safe compare, idempotency by `source_payment_id`, positive-amount validation — but the secret is not secret.

Root cause is subtle and worth understanding: `.gitignore` does the right thing (`.env`, `.env.*`) **but then whitelists the template** with `!.env.example`. The real value was pasted into the file that the ignore rules deliberately protect.

### Fix (today)

```powershell
cd "C:\Users\Sathya\Downloads\Project\trust-crm"
# 1. Generate a new secret
$new = -join ((1..64) | ForEach-Object { '{0:x}' -f (Get-Random -Max 16) })
# 2. Put the placeholder (not the value) in .env.example
#    WEBHOOK_SECRET=replace_with_openssl_rand_hex_32
# 3. Set the new value in Render (WEBHOOK_SECRET) AND Vercel (CRM_WEBHOOK_SECRET) — they must match
# 4. Commit, then:
git filter-repo --replace-text <(echo "2ad2a2…aedbab==>REDACTED")   # purge history
git push --force
```

Also: `WEBHOOK_SECRET` is **absent from `render.yaml`**, so it was set by hand in the dashboard — undocumented and easy to lose. Add it to `render.yaml` with `sync: false`.

---

## 3. 🔴 Finding 2 — `/wa` gives anyone an authenticated WhatsApp Web session

`backend/src/routes/whatsappProxy.js` reverse-proxies `web.whatsapp.com` through the CRM's own origin. It is mounted **with no authentication at all**:

```js
// server.js:87
app.use('/wa', proxyHandler);   // ← no requireAuth, no requireRole
```

The design makes this far worse than a plain proxy:

| Mechanism | Code | Consequence |
|---|---|---|
| **Single shared cookie jar** | `let cookieJar = ''` — "Single shared jar — fine for one-org CRM" | The server holds *one* WhatsApp Web session and replays its cookies upstream for **every** visitor |
| Browser cookies explicitly dropped | `if (lk === 'cookie') continue;` | Every request uses the shared session regardless of who is asking |
| Frame-blocking headers stripped | `STRIP` set removes CSP, `X-Frame-Options`, COOP, CORP | Any website can iframe your WhatsApp session (clickjacking) |
| UA spoofing | Always presents Mac Safari UA | Deliberately evades WhatsApp's anti-bot control |
| **Session cookies written to logs** | `console.log('[wa-proxy] fwd-headers:', JSON.stringify(fwd))` and `set-cookie` logging | Live WhatsApp session credentials land in Render's log stream |
| WebSocket upgrade also unauthenticated | `server.on('upgrade', …)` checks only the path prefix | Same exposure over the WS channel |

**Impact:** any unauthenticated party who requests `https://<crm-domain>/wa/` is served the trust's logged-in WhatsApp session — read every message, and send as the trust. I confirmed the route is mounted on the live service (`OPTIONS /wa` → 200) but deliberately did **not** drive traffic through it to WhatsApp.

**Fix:** delete this proxy. Replace with the official WhatsApp Cloud API, or if the Puppeteer session (`sessionManager.js`) is meant to be the mechanism, use that *with* auth and drop the shared-cookie-jar proxy entirely. At minimum, put `requireAuth` + `requireRole('admin')` in front of `/wa`, give each user their own jar, and remove the two `console.log` lines that dump cookies.

---

## 4. 🟠 Finding 3 — the backup cannot actually restore the ledger

`backend/src/services/backup.js` — a daily cron dumps tables to an Excel workbook and uploads it to Telegram. It reports success. But:

**(a) It backs up 5 of ~30 tables.**

```js
const TABLES = [
  { name: 'transactions' }, { name: 'contacts' }, { name: 'categories' },
  { name: 'contact_groups' }, { name: 'activity_logs' },
];
```

**Not** backed up: `settings` (**opening balances**), `profiles` (users/roles), `chart_of_accounts`, `journal_entries`, `journal_entry_lines`, `functions` + categories/items, `trustees`, `beneficiaries`, `beneficiary_disbursements`, `compliance_items`/`returns`, `donation_receipts`, `bank_statements`, `bank_reconciliation_items`, `recurring_transactions`, `scheduled_reports`, `mail_logs`, `inbox_messages`, `file_send_logs`.

A restore from this backup would rebuild transactions but produce **wrong balances** (no opening balances) and silently lose every feature built after the first iteration — including the double-entry journal that is supposed to be the accounting source of truth.

**(b) Silent 5000-row truncation.**

```js
await supabaseAdmin.from(t.name).select('*').limit(5000)
```

No warning, no flag in `backup_logs`. `transactions` and `activity_logs` will pass 5000 rows; from then on every backup is quietly incomplete while still logging `success`.

**(c) Destination is Telegram.** The complete financial dataset leaves to a third-party messaging platform, readable by anyone holding the bot token.

**Fix:** derive `TABLES` from the schema (or at least add the 25 missing ones, `settings` first), paginate with `.range()` instead of `limit(5000)`, and assert `rowsWritten == rowsExpected` — fail the backup loudly if not. Then actually rehearse a restore.

---

## 5. 🟠 Finding 4 — WhatsApp session encryption fails open

`backend/src/lib/whatsappCrypto.js`:

```js
const RAW_KEY = process.env.WA_SESSION_ENCRYPTION_KEY || '';
const ENC_KEY = RAW_KEY
  ? (RAW_KEY.length === 64 ? Buffer.from(RAW_KEY, 'hex') : sha256(RAW_KEY))
  : sha256('fallback-dev-key-change-me');   // ← hardcoded, public key
```

If `WA_SESSION_ENCRYPTION_KEY` is unset or misspelled in production, session files are encrypted with a **key that is in the source code** — encryption that appears present but provides nothing. The AES-256-GCM implementation itself is correct (random 12-byte IV, auth tag, proper `setAuthTag`).

**Fix:** throw on startup if the key is missing. Never ship a fallback key.

**Related:** sessions are stored on local disk (`backend/.wa-sessions/`) which on Render is **ephemeral** — wiped on every deploy and restart. `manager.restoreSessions()` at boot then has nothing to restore, so WhatsApp reconnect (and anything depending on it) breaks on each deploy. Use a persistent volume or object storage.

---

## 6. Server hardening gaps

| # | Issue | Location | Note |
|---|---|---|---|
| 1 | **CORS reflects any HTTPS origin** with `credentials: true` | `server.js:24` — `if (/^https:\/\//.test(origin)) return true)` | The comment argues it's safe because auth is Bearer-token, not cookies. True today — but `credentials: true` + reflect-any-origin is one cookie away from a serious hole. Pin to the three known origins; the list already exists above it |
| 2 | **CSP, frameguard, COOP, COEP, CORP all disabled** | `server.js:29-35` | Reasonable given the iframe proxy, but once `/wa` is gone, re-enable CSP + frameguard on a financial app |
| 3 | Session tokens in `localStorage` | Supabase JS default in `lib/supabase.js` | Any XSS = full token theft. No CSP to mitigate |
| 4 | `sanitizeHtml` is regex-based | `lib/security.js:24-36` | Known-bypassable. Used on **outbound** mail body (`mail.js:71`) so impact is currently low — but do not reuse it for inbound HTML. Use DOMPurify |
| 5 | Auth profile cache TTL 60 s | `middlewares/auth.js` | A role revocation takes up to 60 s to apply. `invalidateProfileCache` exists and is wired into `users.js` — keep it that way |
| 6 | Secrets in `console.log` | `whatsappProxy.js:104,113,152` | Cookie jar + `set-cookie` values dumped to logs |

**Webhook auth itself is good** — `safeEqual` is a correct constant-time compare, and it checks `!WEBHOOK_SECRET` first. The problem is only that the secret is public.

---

## 7. Nice-to-have findings (accuracy, not urgency)

- **`/api/accounts` is mounted twice** — `server.js:55` and `server.js:60`. Harmless but should be one line.
- **`fix-grants.sql` enables RLS on 3 tables with zero policies** (`activity_logs`, `backup_logs`, `contact_groups`). Deny-by-default for anon — correct — but the file's comment claims it "recreate[s] the policies", which it doesn't.
- **Verified non-issue:** `GOOGLE_PRIVATE_KEY` history hits are the `.env.example` placeholder `YOUR_KEY_HERE`, not a real key. The current `.env.example` line is `"[REDACTED PRIVATE KEY]"`.
- **Verified non-issue:** `frontend/dist/` is **not** tracked (`dist/` is ignored) despite existing on disk.
- **Verified strong:** RLS is enabled on every table — `migration.sql` 9/9 tables + 26 policies, `schema.sql` 8/8 + 23, and migrations `001`–`011` all pair `CREATE TABLE` with `ENABLE ROW LEVEL SECURITY` + policies. The README's "three layers of protection" claim holds up under inspection.

---

## 8. Code health

| Issue | Detail |
|---|---|
| **Dead mobile tree** | `frontend/src/mobile/` — **51 files, 153 KB, zero references.** `App.jsx` imports only `./mobile2/MobileApp`. The `mobile2` rewrite (44 files) superseded it; v1 was never deleted. Delete it |
| **No tests at all** | No framework, no `test` script, no test files. `test-db.js` / `test-features.js` are ad-hoc scripts. For double-entry accounting, a posting/balance test suite is the highest-value addition available |
| **Two competing migration systems** | `backend/src/migrations/001–014` (numbered, current) **and** `backend/supabase/*.sql` (15 unnumbered files incl. one-off patches). No runner executes `src/migrations` |
| **README quick-start is broken** | It instructs users to run `backend/supabase/migration.sql`, which I confirmed **contains none of** `functions`, `chart_of_accounts`, `journal_entries`, `trustees`, `beneficiaries`, `compliance_items`, `donation_receipts`, `bank_statements`, `scheduled_reports`, `recurring_transactions`. A fresh clone per the README yields a schema missing ~20 tables |
| **Oversized components** | `Reports.jsx` 99,750 B · `Functions.jsx` 58,291 B · `Transactions.jsx` 48,370 B · `BackupLogs.jsx` 32,969 B. Hard to review or diff safely |
| **Broken worktree** | `.kilo/worktrees/wonderful-mink` is marked **prunable** and points at a Tailscale path (`//sathya-thinkpad.tailaed199.ts.net/…`) — a second checkout on another machine, living inside this repo. Local branch `wonderful-mink` @ `ca29bc1` also exists |
| **Stray files** | `commit-msg.txt`, `logo.jpg` (326 KB, duplicated 3× in `public/`, `dist/`, root), `.vercel/`, runtime `server.log` + `logs/*.jsonl` |
| **Reclaimable space** | ~1.05 GB: `frontend/node_modules` 502 MB, `backend/node_modules` 431.6 MB, `.kilo/node_modules` 52.8 MB, root `node_modules` 39.1 MB, worktree `node_modules` 35.3 MB, `frontend/dist` 11.6 MB |

### Documentation is materially stale

**`IMPLEMENTATION-PLAN.md`** marks **every phase "Not Started" with commit `0000000`** — Phase 1 (chart of accounts + journal), Phase 2 (ledger/trial balance/BS/P&L/cash flow), Phase 3 (trustees/beneficiaries), Phase 4 (compliance), Phase 5 (donation receipts), Phase 6 (bank reconciliation). **All six are already built**: migrations `005`–`011`, routes `accounts.js` / `journalEntries.js` / `trustees.js` / `compliance.js` / `receipts.js` / `bankReconciliation.js`, and pages `Accounts.jsx` / `JournalEntries.jsx` / `TrialBalance.jsx` / `GeneralLedger.jsx` / `Trustees.jsx` / `Beneficiaries.jsx` / `Compliance.jsx` / `Receipts.jsx` / `BankReconciliation.jsx` all exist. The plan describes the project as it was two months ago.

It also lists a route path that doesn't match the code: plan says `GET /api/reports/balance-sheet`, actual is `GET /api/reports/financials/balance-sheet`.

**`ROLLBACK-PLAN.md`** says "Latest working commit `68922d3`" — actual HEAD is `3510540`, ~40+ commits later. It also recommends `git reset --hard` + `git push --force` as the recovery path. On a public repo that also hosts a live branch and a worktree, force-pushing `main` is a dangerous default; prefer `git revert`.

---

## 9. What's genuinely good

Worth stating plainly, because the security findings above shouldn't obscure it:

- **Auth/RBAC is properly layered.** `requireAuth` → `requireRole` is applied in **every** router (verified all 28 — `mail.js` and `fileSend.js` apply it per-route, the rest via `router.use`). I confirmed production returns 401 without a token.
- **RLS is real**, on all ~30 tables, with 26+ policies in the core migration.
- **The webhook design is sound** (timing-safe compare, idempotency, validation) — only the secret handling is wrong.
- **Path-traversal defence is correct** — `isSafePath` plus a belt-and-braces `!p.includes('..')` check in `drive.js`, and `safeContentDisposition` sanitises download filenames.
- **Upload limits are set** everywhere (5 MB contacts CSV, 20 MB receipts, 50 MB drive/mail/file-send).
- **Rate limiting** is global (120/min) plus a tighter bucket (20/min) on sensitive routes.
- **AES-256-GCM usage is correct**, and `googleDrive.js` keeps the service account server-side.
- **`.gitignore` is thoughtful**, with an explicit "NEVER commit real credentials" comment — the intent was right; one file slipped.
- **The `.hermes` integration** (website → CRM donations and contacts) is coherent, documented, idempotent, best-effort, and consent-gated.

---

## 10. Prioritised actions

**Today**
1. **Rotate `WEBHOOK_SECRET`** (Render + Vercel), replace it with a placeholder in `.env.example`, purge via `git filter-repo`, force-push. *Anyone can currently forge ledger income.*
2. **Remove or lock down `/wa`.** *Anyone can currently read/send WhatsApp as the trust.*
3. Rotate the other exposed credentials: Supabase **`service_role`** key (`twgunjmacbfqqpjpgrjt`), Google service-account private key, `RESEND_API_KEY`, `TELEGRAM_BOT_TOKEN`, `SMTP_PASS` — all present in plaintext in `backend/.env`.

**This week**
4. Make `WA_SESSION_ENCRYPTION_KEY` fail-closed; move `.wa-sessions/` to persistent storage.
5. Fix the backup: all tables, paginated reads, restore rehearsal, loud failure on short writes.
6. Pin CORS to the three known origins; remove the cookie-dumping `console.log`s.
7. Add `WEBHOOK_SECRET` to `render.yaml`.

**Then**
8. Delete `frontend/src/mobile/` (51 files of dead code) and the duplicate `/api/accounts` mount.
9. Consolidate on `backend/src/migrations/`; write a runner; fix the README quick-start.
10. Add a test suite — start with double-entry posting and balance invariants.
11. Rewrite `IMPLEMENTATION-PLAN.md` and `ROLLBACK-PLAN.md`; replace the force-push rollback advice with `git revert`.
12. Prune the dead worktree, drop `.kilo/`, and reclaim ~1.05 GB of `node_modules` + `dist`.

---

## 11. Method & caveats

- Static review of all 326 source files (routes, services, libs, migrations, frontend pages/hooks).
- Auth coverage audited per-router by counting `requireAuth`/`requireRole` against route counts — not sampled.
- RLS audited by matching `CREATE TABLE` against `ENABLE ROW LEVEL SECURITY` and `CREATE POLICY` per SQL file.
- Secret exposure established from `git ls-files`, `git log -S`, and `git branch -r --contains` — not inferred.
- Production checks were minimal and read-only: `GET /health`, unauthenticated `GET /api/transactions` (expects 401), `OPTIONS /wa`, and one `POST` to the donation webhook **with a deliberately wrong key**, which creates nothing. **I did not send the real secret and did not create, modify or delete any data.**
- I did **not** route traffic through `/wa` to WhatsApp, to avoid acting on a third-party service through a live authenticated session.
- Secret values are masked as prefixes throughout.
