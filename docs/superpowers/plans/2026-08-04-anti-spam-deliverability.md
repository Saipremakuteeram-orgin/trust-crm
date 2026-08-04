# Anti-Spam Deliverability Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one-click unsubscribe, Reply-To, and content best-practices to every CRM email so mail is more likely to reach the inbox.

**Architecture:** Self-contained subscription service on the existing Supabase + Express stack. A new `mail_unsubscribes` table stores per-recipient tokens; `sendEmail` (the single outbound entry point in `backend/src/services/notify.js`) filters unsubscribed addresses, adds `List-Unsubscribe` headers and Reply-To, and applies a subject-cleaner. Public GET/POST routes on the mail router let recipients opt out without logging in.

**Tech Stack:** Node.js/Express, Supabase (postgREST admin client), Resend (primary HTTPS delivery), nodemailer (SMTP fallback), `crypto` (token generation).

## Global Constraints

- All outbound email flows through `sendEmail` in `backend/src/services/notify.js`. Do not add a second entry point.
- `notify.js` must keep using **relative requires** (`require('../config/supabaseAdmin')`, `require('./unsubscribe')`), NOT the `@/` alias, so local verification scripts can `require` it without `module-alias/register`.
- Resend inline images use `content_id` (referenced via `cid:`); already implemented for the logo.
- Unsubscribe one-click POST (RFC 8058) must return `200` with an empty body for both known AND unknown tokens — never `4xx`/`5xx`.
- Suppression is best-effort: any DB failure must log and CONTINUE sending rather than dropping mail silently.
- Do not commit `.env`. Document new vars in `backend/.env.example` only.
- PowerShell shell: use `&` for native git; avoid `&&`; run Node scripts in `workdir: backend`.
- Verifying the migration requires running the SQL once in Supabase SQL Editor (like prior migrations); the code is written to work only after the table exists.

---

### Task 1: `mail_unsubscribes` table + `unsubscribe` service module

**Files:**
- Create: `backend/supabase/unsubscribes.sql`
- Create: `backend/src/services/unsubscribe.js`
- Test: `backend/scripts/verify_unsubscribes.js`

**Interfaces:**
- Produces (all async):
  - `ensureTokens(emails) => Promise<token>` — upserts one row per unique email sharing one token; returns the token.
  - `getUnsubscribed(emails) => Promise<Set<string>>` — returns lowered emails currently unsubscribed.
  - `unsubscribeByToken(token) => Promise<email[]>` — marks the token's emails unsubscribed, syncs `contacts.unsubscribed = true`, returns the emails.
  - `subscribeByToken(token) => Promise<email[]>` — marks the token's emails subscribed, syncs `contacts.unsubscribed = false`, returns the emails.
  - `getEmailsByToken(token) => Promise<email[]>` — returns emails for the token regardless of status (for the confirmation page).

- [ ] **Step 1: Create the migration**

Write `backend/supabase/unsubscribes.sql`:

```sql
-- ============================================================
-- mail_unsubscribes: per-recipient unsubscribe tokens
-- Run this in Supabase Dashboard -> SQL Editor -> New query -> RUN
-- ============================================================

create table if not exists public.mail_unsubscribes (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  token text not null,
  unsubscribed boolean not null default false,
  source text,
  created_at timestamptz not null default now(),
  unique (email)
);

create index if not exists idx_mail_unsubscribes_unsubscribed on mail_unsubscribes (unsubscribed);
create index if not exists idx_mail_unsubscribes_token on mail_unsubscribes (token);

alter table mail_unsubscribes enable row level security;

-- Backend (service role) full access; no client access needed.
drop policy if exists "service all mail_unsubscribes" on mail_unsubscribes;
create policy "service all mail_unsubscribes" on mail_unsubscribes
  for all using (true);

grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
alter default privileges in schema public grant all privileges on tables to service_role;
alter default privileges in schema public grant all privileges on sequences to service_role;
```

- [ ] **Step 2: Create the service module**

Write `backend/src/services/unsubscribe.js`:

```js
const crypto = require('crypto');
const supabaseAdmin = require('../config/supabaseAdmin');

function norm(email) {
  return String(email || '').trim().toLowerCase();
}

async function ensureTokens(emails) {
  const token = crypto.randomBytes(24).toString('hex');
  const list = [...new Set(emails.map(norm).filter(Boolean))];
  for (const email of list) {
    await supabaseAdmin
      .from('mail_unsubscribes')
      .upsert({ email, token, unsubscribed: false, source: 'send' }, { onConflict: 'email' });
  }
  return token;
}

async function getUnsubscribed(emails) {
  const list = [...new Set(emails.map(norm).filter(Boolean))];
  if (!list.length) return new Set();
  const { data, error } = await supabaseAdmin
    .from('mail_unsubscribes')
    .select('email')
    .in('email', list)
    .eq('unsubscribed', true);
  if (error) throw new Error(error.message);
  return new Set((data || []).map((r) => r.email));
}

async function setByToken(token, unsubscribed) {
  const { data, error } = await supabaseAdmin
    .from('mail_unsubscribes')
    .select('email')
    .eq('token', token);
  if (error) throw new Error(error.message);
  const emails = (data || []).map((r) => r.email);
  if (!emails.length) return [];
  await supabaseAdmin.from('mail_unsubscribes').update({ unsubscribed }).in('email', emails);
  for (const email of emails) {
    await supabaseAdmin.from('contacts').update({ unsubscribed }).eq('email', email);
  }
  return emails;
}

async function unsubscribeByToken(token) {
  return setByToken(token, true);
}

async function subscribeByToken(token) {
  return setByToken(token, false);
}

async function getEmailsByToken(token) {
  const { data, error } = await supabaseAdmin
    .from('mail_unsubscribes')
    .select('email')
    .eq('token', token);
  if (error) throw new Error(error.message);
  return (data || []).map((r) => r.email);
}

module.exports = {
  ensureTokens,
  getUnsubscribed,
  unsubscribeByToken,
  subscribeByToken,
  getEmailsByToken,
};
```

- [ ] **Step 3: Write the verification script**

Write `backend/scripts/verify_unsubscribes.js`:

```js
require('dotenv').config();
const u = require('../src/services/unsubscribe');

(async () => {
  const probe = 'unsubscribe-probe-' + Date.now() + '@example.com';
  const token = await u.ensureTokens([probe]);
  console.log('token:', token);
  console.log('before (expect false):', (await u.getUnsubscribed([probe])).has(probe));
  const got = await u.unsubscribeByToken(token);
  console.log('unsubscribed emails:', got);
  console.log('after (expect true):', (await u.getUnsubscribed([probe])).has(probe));
  await u.subscribeByToken(token);
  console.log('resubscribed (expect false):', (await u.getUnsubscribed([probe])).has(probe));
  // cleanup probe rows + contacts
  await require('../src/config/supabaseAdmin').from('mail_unsubscribes').delete().eq('email', probe);
  process.exit(0);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
```

- [ ] **Step 4: Apply the migration (manual, one-time) + run verification**

Run the `unsubscribes.sql` contents in Supabase Dashboard → SQL Editor (live project), so the table exists.

Then run:

```
node scripts/verify_unsubscribes.js
```

Expected output (order approximate): prints a token, `before (expect false): false`, an array containing the probe email, `after (expect true): true`, `resubscribed (expect false): false`. Exit code 0.

- [ ] **Step 5: Commit**

```bash
git add backend/supabase/unsubscribes.sql backend/src/services/unsubscribe.js backend/scripts/verify_unsubscribes.js
git commit -m "feat: add mail unsubscribe token table and service"
```

---

### Task 2: Anti-spam upgrades in `sendEmail` (headers, Reply-To, suppression, subject cleaner)

**Files:**
- Modify: `backend/src/services/notify.js` (constants + `buildListUnsubscribeHeaders`, `cleanSubject`, `defaultReplyTo`; refactor `sendViaResend`; rewrite `sendEmail`)
- Modify: `backend/src/services/notify.js` exports (add `cleanSubject`, `buildListUnsubscribeHeaders`, `defaultReplyTo`)
- Test: `backend/scripts/verify_send_email.js`

**Interfaces:**
- Consumes: `ensureTokens`, `getUnsubscribed` from `./unsubscribe`; `supabaseAdmin` from `../config/supabaseAdmin`.
- Produces:
  - `cleanSubject(subject) => string`
  - `buildListUnsubscribeHeaders(token) => { 'List-Unsubscribe': string, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } | null`
  - `defaultReplyTo() => string`
  - `sendEmail({ to, subject, html, text, attachments, replyTo })` — now async-filters unsubscribed, adds headers + replyTo.

- [ ] **Step 1: Add a supabaseAdmin require + helpers**

After the `require`s at the top of `notify.js` (`const axios = require('axios');`), add:

```js
const supabaseAdmin = require('../config/supabaseAdmin');
```

After the existing `CONTACT_EMAIL` / `CONTACT_PHONE` constants add:

```js
const BACKEND_URL = process.env.BACKEND_URL || 'https://trust-crm-b8rn.onrender.com';

function defaultReplyTo() {
  return process.env.CONTACT_EMAIL || process.env.RESEND_FROM_EMAIL || process.env.SMTP_USER || '';
}

function cleanSubject(subject) {
  let out = String(subject || '').replace(/^[\s\p{Extended_Pictographic}\uD800-\uDFFF]+/u, '').trim();
  if (out.length > 90) out = out.slice(0, 90).trimEnd() + '…';
  return out || '(no subject)';
}

function buildListUnsubscribeHeaders(token) {
  if (!token) return null;
  const url = `${BACKEND_URL}/api/mail/unsubscribe?token=${encodeURIComponent(token)}`;
  return { 'List-Unsubscribe': `<${url}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' };
}
```

- [ ] **Step 2: Update `sendViaResend` to accept `headers` and `replyTo`**

Replace the `sendViaResend` signature and `payload` construction (lines ~94-103) with:

```js
async function sendViaResend({ to, subject, html, text, attachments, headers, replyTo }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null; // signal "not configured"
  const from = getResendFrom();
  const payload = {
    from,
    to: Array.isArray(to) ? to : String(to).split(',').map((s) => s.trim()),
    subject,
    html,
  };
  if (text) payload.text = text;
  if (replyTo) payload.reply_to = replyTo;
  if (headers) payload.headers = headers;
```

- [ ] **Step 3: Rewrite `sendEmail`**

Replace the whole current `sendEmail` body (lines ~127-156) with:

```js
async function sendEmail({ to, subject, html, text, attachments, replyTo }) {
  const recipients = Array.isArray(to)
    ? to.map((s) => String(s).trim().toLowerCase()).filter(Boolean)
    : String(to || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!recipients.length) return { ok: false, reason: 'no-recipients' };

  const cleanedSubject = cleanSubject(subject);

  // Suppression + unsubscribe token (best-effort: never block/drop mail on DB error)
  let active = recipients;
  let token = null;
  try {
    const unsub = await getUnsubscribed(recipients);
    if (unsub.size) {
      const skipped = recipients.filter((r) => unsub.has(r));
      console.log(`[mail] skipped unsubscribed: ${skipped.join(', ')}`);
    }
    active = recipients.filter((r) => !unsub.has(r));
    if (active.length) token = await ensureTokens(active);
  } catch (err) {
    console.error('[mail] unsubscribe check failed, sending anyway:', err.message);
    active = recipients;
  }

  if (!active.length) return { ok: true, skippedAll: true };

  // Wrap in the branded template (logo, address, auto-generated disclaimer) and
  // attach the trust logo inline so it displays even when remote images are blocked.
  const contentHtml = String(html || '');
  const brandedHtml = buildBrandedHtml(contentHtml);
  const brandedText = text || htmlToText(contentHtml);
  const allAttachments = Array.isArray(attachments) ? [...attachments] : [];
  if (LOGO_URL) allAttachments.push({ filename: 'logo.jpg', path: LOGO_URL, cid: 'trust-logo' });

  const headers = buildListUnsubscribeHeaders(token);
  const effectiveReplyTo = replyTo || defaultReplyTo();

  // Prefer Resend (HTTPS/443) — works on hosts that block outbound SMTP (e.g. Render).
  const resendResult = await sendViaResend({
    to: active,
    subject: cleanedSubject,
    html: brandedHtml,
    text: brandedText,
    attachments: allAttachments,
    headers,
    replyTo: effectiveReplyTo,
  });
  if (resendResult) return resendResult; // configured (success or hard fail)

  // Fallback to Gmail SMTP (works locally / on SMTP-allowed hosts).
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.error('Email send skipped: neither RESEND_API_KEY nor SMTP configured');
    return { ok: false, reason: 'email-not-configured' };
  }
  const t = getTransporter();
  if (!t) return { ok: false, reason: 'no-transporter' };
  try {
    const mailOptions = {
      from: `"Trust CRM" <${process.env.SMTP_USER}>`,
      to: active.join(','),
      subject: cleanedSubject,
      html: brandedHtml,
      text: brandedText,
    };
    if (effectiveReplyTo) mailOptions.replyTo = effectiveReplyTo;
    if (headers) mailOptions.headers = headers;
    if (allAttachments.length > 0) mailOptions.attachments = allAttachments;
    await t.sendMail(mailOptions);
    return { ok: true };
  } catch (err) {
    console.error('Email send failed:', err.message);
    return { ok: false, reason: err.message };
  }
}
```

- [ ] **Step 4: Update exports**

Replace the final `module.exports` line with:

```js
module.exports = { sendEmail, sendTelegram, notifyContactsOfTransaction, fmt, getTransporter, cleanSubject, buildListUnsubscribeHeaders, defaultReplyTo, buildBrandedHtml };
```

- [ ] **Step 5: Write + run the verification script**

Write `backend/scripts/verify_send_email.js`:

```js
require('dotenv').config();
const n = require('../src/services/notify');

// Pure helpers
console.log('cleanSubject:', JSON.stringify(n.cleanSubject('  🟢 New Credit (Money In) — ₹1,000  ')));
console.log('cleanSubject long:', JSON.stringify(n.cleanSubject('x'.repeat(120))));
console.log('headers:', JSON.stringify(n.buildListUnsubscribeHeaders('abc123')));
console.log('defaultReplyTo:', n.defaultReplyTo());

// End-to-end suppression: a probe address we then unsubscribe
const crypto = require('crypto');
const u = require('../src/services/unsubscribe');
const admin = require('../src/config/supabaseAdmin');
const probe = 'probe-' + crypto.randomBytes(4).toString('hex') + '@example.com';

(async () => {
  await u.ensureTokens([probe]);
  await u.unsubscribeByToken((await admin.from('mail_unsubscribes').select('token').eq('email', probe).single()).data.token);
  const r = await n.sendEmail({ to: probe, subject: 'should be skipped', html: '<p>skip me</p>' });
  console.log('send to unsubscribed (expect {ok:true,skippedAll:true}):', JSON.stringify(r));
  await admin.from('mail_unsubscribes').delete().eq('email', probe);
  process.exit(0);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
```

Run:

```
node scripts/verify_send_email.js
```

Expected: `cleanSubject` prints `"New Credit (Money In) — ₹1,000"` and a `(~90 char)…` value; `headers` prints an object with `List-Unsubscribe: <https://###/api/mail/unsubscribe?token=abc123>` and `List-Unsubscribe-Post: 'List-Unsubscribe=One-Click'`; `defaultReplyTo` prints `xx@gmail.com` (or your configured CONTACT_EMAIL); the resend line prints `{"ok":true,"skippedAll":true}`. Exit 0.

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/notify.js backend/scripts/verify_send_email.js
git commit -m "feat: add one-click unsubscribe headers, reply-to and subject cleanup to sendEmail"
```

---

### Task 3: Public unsubscribe/subscribe endpoints + composer Reply-To

**Files:**
- Modify: `backend/src/routes/mail.js` (add `POST /unsubscribe`, `GET /unsubscribe`, `POST /subscribe`; pass `replyTo` in `/send`)
- Test: manual `curl` verification

**Interfaces:**
- Consumes: `unsubscribeByToken`, `subscribeByToken`, `getEmailsByToken` from `@/services/unsubscribe`; `buildBrandedHtml` from `@/services/notify` (screen/body wrapper).

- [ ] **Step 1: Add the require**

At the top of `mail.js`, after `const { sendEmail, sendTelegram } = require('@/services/notify');`, add:

```js
const { sendEmail, sendTelegram, buildBrandedHtml } = require('@/services/notify');
const { unsubscribeByToken, subscribeByToken, getEmailsByToken } = require('@/services/unsubscribe');
const crypto = require('crypto');
```

(Keep the existing `sendEmail`/`sendTelegram` import line — replace it with the combined import above.)

- [ ] **Step 2: Pass Reply-To in the composer send**

In the `/send` handler, change the `sendEmail({` call greeting to include the sender's email (add `replyTo: req.user.email`, `subject: subject || '(no subject)'` unchanged):

```js
const mailRes = await sendEmail({
  to: validRecipients.join(','),
  subject: subject || '(no subject)',
  html: sanitizeHtml(body) || '<p></p>',
  attachments,
  replyTo: req.user.email,
});
```

- [ ] **Step 3: Add the public routes before `module.exports`**

Insert before `module.exports = router;`:

```js
// --- Public unsubscribe endpoints (recipients are NOT CRM users; no auth) ---

// One-click unsubscribe (RFC 8058): mail clients POST here. Must return 200 even for unknown tokens.
router.post('/unsubscribe', async (req, res) => {
  const token = String(req.body?.token || '').trim();
  if (!token) return res.status(200).json({ success: true });
  try {
    await unsubscribeByToken(token);
  } catch (err) {
    console.error('[mail] unsubscribe failed:', err.message);
  }
  res.status(200).json({ success: true });
});

router.get('/unsubscribe', async (req, res) => {
  const token = String(req.query?.token || '').trim();
  let emails = [];
  if (token) {
    try { emails = await getEmailsByToken(token); } catch (err) { console.error('[mail] unsubscribe page lookup failed:', err.message); }
  }
  const ok = !!emails.length;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(buildBrandedHtml(`
    <div style="text-align:center;padding:12px 0;">
      <h2 style="color:#0b3c6d;margin:0 0 8px;">${ok ? 'You have been unsubscribed' : 'Invalid or expired link'}</h2>
      <p style="color:#666;line-height:1.6;margin:8px 0 20px;">
        ${ok
          ? (emails.length === 1
              ? `<b>${emails[0]}</b> will no longer receive email notifications from Sri Sai Dharma Samrakshana Prema Kuteeram.`
              : `The linked address (${emails.length} total) will no longer receive email notifications.`)
          : 'This unsubscribe link is invalid or has expired. No further action is needed.'}
      </p>
      ${ok ? `<p><a href="${'#none'}" onclick="event.preventDefault();fetch('/api/mail/subscribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:${JSON.stringify(token)}})}).then(()=>location.reload())" style="color:#0b3c6d;">Re-subscribe</a></p>` : ''}
    </div>`));
});

// Re-subscribe: clears the unsubscribed flag for the token's emails.
router.post('/subscribe', async (req, res) => {
  const token = String(req.body?.token || '').trim();
  if (!token) return res.status(400).json({ success: false, message: 'token required' });
  await subscribeByToken(token);
  res.status(200).json({ success: true });
});
```

- [ ] **Step 4: Syntax-check + run the server locally and curl the routes**

```
node --check src/routes/mail.js
```

Start locally (short-lived) in `workdir: backend` with `PORT=8899 node src/server.js` (in another terminal), then:

```
# create a token for a probe email
node -e "require('dotenv').config();require('./src/services/unsubscribe').ensureTokens(['probe@example.com']).then(console.log)"
# visit the confirmation page (expect branded "unsubscribed" page; use the printed token in the URL)
curl -s "http://localhost:8899/api/mail/unsubscribe?token=TOKEN"
# one-click POST (expect 200)
curl -s -X POST -H "Content-Type: application/json" -d "{\"token\":\"TOKEN\"}" http://localhost:8899/api/mail/unsubscribe
# resubscribe (expect 200)
curl -s -X POST -H "Content-Type: application/json" -d "{\"token\":\"TOKEN\"}" http://localhost:8899/api/mail/subscribe
# unknown token one-click (expect 200, NOT an error)
curl -s -X POST -H "Content-Type: application/json" -d "{\"token\":\"does-not-exist\"}" http://localhost:8899/api/mail/unsubscribe
```

Expected: GET shows a branded page with "You have been unsubscribed"; all POSTs return `{"success":true}` and HTTP 200.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/mail.js
git commit -m "feat: add public unsubscribe/subscribe endpoints and composer reply-to"
```

---

### Task 4: Document env vars

**Files:**
- Modify: `backend/.env.example`
- Modify: `backend/.env` (local only, gitignored)

**Interfaces:**
- Consumes: `BACKEND_URL`, `CONTACT_EMAIL`, `CONTACT_PHONE` (used by `notify.js`).

- [ ] **Step 1: Update `backend/.env.example`**

After the existing `CONTACT_*` block (added in the branding commit), append:

```
# Base URL for unsubscribe links (backend API host). Override if the app is reachable elsewhere.
BACKEND_URL=https://trust-crm-b8rn.onrender.com
```

- [ ] **Step 2: Update local `backend/.env` (gitignored)**

Add the same `BACKEND_URL=...` line, and set `CONTACT_EMAIL=` / `CONTACT_PHONE=` to the real values if you have them (leave commented otherwise — defaults `xx@gmail.com` / `+91 XXXXXXXXXX` are used).

- [ ] **Step 3: Commit**

```bash
git add backend/.env.example
git commit -m "docs: document BACKEND_URL for unsubscribe links"
```

---

### Task 5: Go-live verification

**Files:**
- None (manual verification on the live site)

- [ ] **Step 1: Deploy**
  Push to `main`; Render auto-deploys the `trust-crm-b8rn` backend. Confirm the migration `unsubscribes.sql` was run once in Supabase SQL Editor.
  Set `BACKEND_URL` (and real `CONTACT_EMAIL`/`CONTACT_PHONE`) in Render env for `trust-crm-b8rn`, then redeploy.

- [ ] **Step 2: Live send check**
  From the CRM Mail page, send to a real Gmail address. In Gmail → "Show original": confirm `List-Unsubscribe` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click` headers AND a Reply-To header. Click the Unsubscribe link → confirm the branded page, then send again to the same address → confirm it is skipped.

- [ ] **Step 3: Regression**
  Confirm the composer still sends with an attachment (previous fix), and that a transaction notification / monthly report still sends.