# Trust CRM — Security Rotation Runbook

**Created:** 2026-10-07  
**Purpose:** Step-by-step commands to rotate every exposed credential found in the codebase, and purge history where applicable.

> ⚠️ **Read this entire file before starting.** Some rotations require coordinated changes across Render, Vercel, Supabase, Google Cloud, and GitHub.

---

## 1. Immediate — Webhook Secret (CRITICAL)

**Exposure:** Committed to `backend/.env.example` in a **public** repo. Live on Render. Confirmed working via production probe.

### Steps

```powershell
cd "C:\Users\Sathya\Downloads\Project\trust-crm"

# 1. Generate new secret
$new = -join ((1..64) | ForEach-Object { '{0:x}' -f (Get-Random -Max 16) })
echo "New secret: $new"

# 2. Update Render (Dashboard → trust-crm-backend → Environment → WEBHOOK_SECRET)
#    Paste the new 64-char hex value. Save → triggers auto-deploy.

# 3. Update Vercel (Dashboard → trust-crm website → Settings → Environment Variables → CRM_WEBHOOK_SECRET)
#    Paste the SAME value. Redeploy.

# 4. Update .env.example with placeholder (already done by fix)
#    WEBHOOK_SECRET=replace_with_openssl_rand_hex_32

# 5. Purge old value from git history
git filter-repo --replace-text <(echo "2ad2a205edfd3bf53d3c5a44605402201d04397bbdbf2d4d70dbd93135aedbab==>REDACTED")
git push --force
```

### Verification

```bash
# Old value should no longer be reachable
curl -X POST https://trust-crm-b8rn.onrender.com/api/webhooks/website-donation \
  -H "Content-Type: application/json" \
  -H "x-trust-webhook-key: 2ad2a205edfd3bf53d3c5a44605402201d04397bbdbf2d4d70dbd93135aedbab" \
  -d '{"donation":{"payment_id":"test","amount":1}}'
# Expect 401 (new secret required)
```

---

## 2. Supabase Service Role Key (CRITICAL)

**Exposure:** `backend/.env` on disk — `SUPABASE_SERVICE_ROLE_KEY` for project `twgunjmacbfqqpjpgrjt`. This key **bypasses RLS** entirely. Never committed, but on disk in a shared workspace.

### Steps

1. Open Supabase Dashboard → `trust-crm` project → Settings → API
2. Click **Reset** next to `service_role` secret
3. Copy new key
4. Update Render → `trust-crm-backend` → Environment → `SUPABASE_SERVICE_ROLE_KEY`
5. (Optional) Update local `.env` if you run locally
6. Redeploy Render

### Verification

```bash
# Old key should be rejected
curl -H "apikey: OLD_KEY" https://twgunjmacbfqqpjpgrjt.supabase.co/rest/v1/profiles
# Expect 401
```

---

## 3. Google Service Account Private Key (CRITICAL)

**Exposure:** `backend/.env` → `GOOGLE_PRIVATE_KEY` (1,732-char PEM). Grants full Drive API access as the service account.

### Steps

1. Google Cloud Console → IAM → Service Accounts → trust-crm service account
2. Keys tab → **Add Key** → Create new JSON key
3. Download JSON → extract `private_key` and `client_email`
6. Update Render → `GOOGLE_PRIVATE_KEY` (full PEM including `\n`), `GOOGLE_SERVICE_ACCOUNT_EMAIL`
7. (Optional) Delete old key in GCP console

---

## 4. Google OAuth Client Secret (HIGH)

**Exposure:** `@ Clinet id and its screts/client_secret_2_2054904388-…json` — OAuth client for PGP Alumni Forum (used by trust-crm? verify). Client ID: `2054904388-…apps.googleusercontent.com`

### Steps

1. Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client IDs
2. Find client `2054904388-…` → **Regenerate secret**
3. Update wherever used (likely trust-crm frontend env `VITE_GOOGLE_CLIENT_ID`/`VITE_GOOGLE_CLIENT_SECRET`)
4. Update Vercel env vars if used there

---

## 5. Resend API Keys (HIGH)

**Exposure:** `backend/.env` → `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_FROM_NAME`. `frontend/.env.production` has `VITE_RESEND_*`?

### Steps

1. Resend Dashboard → API Keys → **Create new key** (give it a label)
2. Copy new key
3. Update Render → `RESEND_API_KEY`
4. Update Vercel if frontend uses it
5. Delete old key in Resend

---

## 6. Telegram Bot Tokens (HIGH)

**Exposure:** Multiple in `.env` files:
- `TELEGRAM_BOT_TOKEN` (backend)
- `TELEGRAM_STORAGE_CHAT_ID` (backup destination)
- `TELEGRAM_LOG_CHANNEL_ID`

### Steps

1. Message `@BotFather` → `/revoke` → select each bot → get new tokens
2. Update Render → `TELEGRAM_BOT_TOKEN`, `TELEGRAM_STORAGE_CHAT_ID`
3. Update Vercel if frontend uses it
4. Update `@ Clinet id and its screts` folder? (unrelated)
5. Re-send a test message to verify

---

## 7. SMTP / Gmail App Password (HIGH)

**Exposure:** `backend/.env` → `SMTP_USER`, `SMTP_PASS`

### Steps

1. Google Account → Security → App passwords → **Delete** the old one for trust-crm
2. Create new App Password → copy 16-char code
3. Update Render → `SMTP_PASS`
4. Test: trigger a manual monthly report via `/api/reports/monthly/send-now`

---

## 8. Razorpay Keys (HIGH)

**Exposure:** SSDPK-orgin (website) `.env` has `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`. The webhook secret is shared with trust-crm (X-Trust-Webhook-Key).

### Steps

1. Razorpay Dashboard → Settings → API Keys → **Regenerate**
2. Update SSDPK-orgin Vercel env
3. Update trust-crm Render `WEBHOOK_SECRET` (must match website's CRM_WEBHOOK_SECRET)
4. Test a live donation on the website → verify CRM receives it

---

## 9. WhatsApp Session Encryption Key (MEDIUM)

**Exposure:** `WA_SESSION_ENCRYPTION_KEY` in `.env.example` (placeholder) but real value on disk. Code now fails closed if missing/short.

### Steps

1. Generate: `openssl rand -hex 32`
2. Update Render → `WA_SESSION_ENCRYPTION_KEY`
3. **Note:** Existing `.wa-sessions/*.enc` files will become unreadable — users will need to re-scan QR codes. Acceptable.

---

## 10. GitHub PAT in pgp_alumin_forum (CRITICAL — different repo)

**Exposure:** `.git/config` in `pgp_alumin_forum` has remote URL with `[REDACTED_GITHUB_PAT]` — live token with `delete_repo`, `admin:org`, `admin:enterprise`, `workflow`, etc.

### Steps

```powershell
cd "C:\Users\Sathya\Downloads\Project\pgp_alumin_forum"

# 1. Revoke on GitHub → Settings → Developer settings → Personal access tokens → Delete [REDACTED_GITHUB_PAT]…
# 2. Create new token with minimal scopes (repo only)
# 3. Update remote URL
git remote set-url origin https://github.com/sk143sathyabusiness/pgp_alumin_forum.git
```

---

## 11. Git History Purge Checklist

After all rotations, purge the **old values** from git history in each repo:

```powershell
# trust-crm (webhook secret)
cd "C:\Users\Sathya\Downloads\Project\trust-crm"
git filter-repo --replace-text <(echo "2ad2a205edfd3bf53d3c5a44605402201d04397bbdbf2d4d70dbd93135aedbab==>REDACTED")
git push --force

# pgp_alumin_forum (if any .env values were committed — check with git log -S)
cd "C:\Users\Sathya\Downloads\Project\pgp_alumin_forum"
git filter-repo --replace-text <(echo "[REDACTED_GITHUB_PAT]==>REDACTED")
git push --force

# SSDPK-orgin (check for GITHUB_TOKEN, Razorpay keys)
cd "C:\Users\Sathya\Downloads\Project\SSDPK-orgin"
git filter-repo --replace-text <(echo "[REDACTED_GITHUB_PAT]…==>REDACTED")  # use actual prefix
git push --force

# telegram-as-storage (check SECURITY.md claims)
cd "C:\Users\Sathya\Downloads\Project\telegram-as-storage"
# SECURITY.md says token is purged — verify with git log -S '8998834073:AAG'
```

---

## 12. Post-Rotation Verification Checklist

After all rotations, verify:

- [ ] `GET /health` on trust-crm → 200
- [ ] `GET /api/transactions` without token → 401
- [ ] Donation on website → appears in CRM ledger as credit
- [ ] Registration on website → appears in CRM contacts
- [ ] Monthly report sends successfully (email + Telegram)
- [ ] Backup runs nightly → file appears in Telegram chat
- [ ] WhatsApp QR scan works (if using Puppeteer path)
- [ ] No old secrets in `git log -S '<old_value>'` across all repos
- [ ] `.env.example` files contain only placeholders

---

## 13. Emergency Contacts

If rotation breaks production and you need to rollback:

| Service | Rollback |
|---|---|
| Render | Dashboard → Deploys → Rollback to previous |
| Vercel | Dashboard → Deployments → Promote previous |
| Supabase | No rollback for keys — generate new again |
| GitHub PAT | New token immediately — no rollback possible |
| Google SA key | New key immediately — no rollback |

---

## 14. Prevent Recurrence

1. **Never put real values in `.env.example`** — the `!.env.example` gitignore rule makes this dangerous
2. **Use Render/Vercel dashboard for secrets** — never commit them
3. **Add a pre-commit hook** to scan for secret patterns (ghp_, eyJ, sk-, rzp_, AIza, GOCSPX-)
4. **Rotate on a schedule** (quarterly) — add to compliance calendar
5. **Audit `.env` files monthly** with `git diff --name-only HEAD` before commits

---

*Runbook ends. Keep this file out of git (add to .gitignore) or store in a password manager.*