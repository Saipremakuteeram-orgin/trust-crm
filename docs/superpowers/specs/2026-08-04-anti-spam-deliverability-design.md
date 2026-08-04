# Anti-Spam Deliverability Features — Design

Date: 2026-08-04
Status: Approved (user: "proceed")

## Problem

Emails sent from the Trust CRM land in the recipient's spam folder. The dominant cause is the
sender domain: `saidharmasamrakshanapremakuteeram.qzz.io` is a shared free Resend domain used by
many senders, so it carries poor reputation. The user does not yet have a custom domain to verify
in Resend, so this work focuses on **code-level deliverability features** that (a) satisfy spam
filters (notably Gmail's one-click unsubscribe signal) and (b) protect sender reputation by giving
recipients a working opt-out.

Out of scope (deferred): switching to a verified custom domain (SPF/DKIM/DMARC), auto-suppression
of hard bounces/complaints, bulk-send throttling.

## Goal

Every email the CRM sends must:

1. Carry a working **one-click `List-Unsubscribe` header** (`List-Unsubscribe` +
   `List-Unsubscribe-Post: List-Unsubscribe=One-Click`).
2. Set a **Reply-To** so replies land in a real inbox (not the no-reply sender).
3. Follow **content best practices**: sane auto-generated subjects (no leading emoji clusters,
   length cap), a plain-text part, consistent From name.

Unsubscribed addresses must stop receiving mail from the CRM.

## Approach

Self-contained subscription service on the existing stack (Supabase + Express). No new external
dependency. Selected over Resend-native broadcasts (doesn't cover composer/notifications/file
sends) and over a static footer-only "reply STOP" (no real mechanism).

## Architecture

### 1. Data — new table `mail_unsubscribes`

Migration SQL in `backend/supabase/unsubscribes.sql`:

```sql
create table if not exists public.mail_unsubscribes (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  token text not null,
  source text,
  created_at timestamptz not null default now(),
  unique (email)
);
```

One row per email. `token` is a random opaque string (crypto.randomBytes) used in unsubscribe URLs.
On unsubscribe, if the email matches a `contacts.email`, also set `contacts.unsubscribed = true`.

### 2. Header generation — in `sendEmail` (backend/src/services/notify.js)

- **Ordering inside `sendEmail`:** (1) filter out already-unsubscribed recipients; (2) assign one
  shared `token` for this send and upsert a `mail_unsubscribes` row for every remaining recipient
  with that token (token is `crypto.randomBytes(24).toString('hex')`). Filtering first makes
  overwriting old tokens safe — an already-unsubscribed recipient never gets re-tokenized, so they
  can't be silently re-subscribed by a new send.
- Build `List-Unsubscribe: <https://{BACKEND_URL}/api/mail/unsubscribe?token=TOKEN>` and
  `List-Unsubscribe-Post: List-Unsubscribe=One-Click` using the shared token. Works identically for
  single-recipient and multi-recipient (composer) sends: unsubscribing marks every row carrying that
  token.
- Pass as `headers` to Resend (`headers` param) and nodemailer (`headers` param).
- `sendEmail` accepts an optional `replyTo`; default is `CONTACT_EMAIL` (falls back to
  `RESEND_FROM_EMAIL`, then `SMTP_USER`). The composer route (`POST /api/mail/send`) passes
  `replyTo = req.user.email` so replies go to the CRM user who sent the message. Mapped to Resend
  `reply_to` / nodemailer `replyTo`.

### 3. Suppression on send

`sendEmail` filters the recipient list against `mail_unsubscribes` before sending. Skipped
addresses are logged (`[mail] skipped unsubscribed: <email>`). This is what makes the opt-out
actually effective for all send paths (composer, transaction notifications, monthly report,
scheduled reports, file send, recurring transactions).

### 4. Public endpoints — backend/src/routes/mail.js (no auth; recipients are not CRM users)

- `GET /api/mail/unsubscribe?token=...` — resolves token, returns a branded HTML confirmation page
  (trust logo, "you have been unsubscribed", re-subscribe link). Unknown token → 404 page.
- `POST /api/mail/unsubscribe` — body `{ token }`. One-click handler. Marks all rows with the token
  as unsubscribed (deletes rows), syncs `contacts.unsubscribed = true`, returns 200 empty body.
  Idempotent: unknown/expired token still returns 200 (mail clients must not see errors).
- `POST /api/mail/subscribe` — body `{ token }`. Re-subscribe: clears the row(s) for the token and
  `contacts.unsubscribed = false`. Returns 200.

Note: unsubscribe POST must succeed silently (RFC 8058) — never 4xx for unknown tokens.

### 5. Content pass

- `cleanSubject(subject)`: strip leading emoji/dingbat cluster, collapse whitespace, cap at ~90
  chars, trim.
- Apply to auto-generated subjects: transaction notifications (`notifyContactsOfTransaction`),
  monthly report, file send. Composer subjects are user-authored — passed through unchanged (only
  trimmed to avoid raw emoji-prefix spam patterns; user content is respected).
- Text part already added (previous commit); From name already consistent (`RESEND_FROM_NAME`).

### 6. Environment

- `BACKEND_URL` (default `https://trust-crm-b8rn.onrender.com`) — base for unsubscribe URLs.
- `CONTACT_EMAIL` — Reply-To default and footer contact (already wired; default placeholder).

## Data flow

1. Any send path calls `sendEmail({ to, subject, html, replyTo, ... })`.
2. `sendEmail` filters unsubscribed recipients → builds headers + tokens → sends via Resend
   (preferred) or SMTP fallback, with `replyTo`.
3. Recipient clicks Unsubscribe (or mail client issues one-click POST).
4. Backend marks email(s) unsubscribed; future sends skip them.

## Error handling

- Unsubscribe token lookup: missing/unknown → branded "invalid or expired" page (GET) / silent 200
  (POST).
- DB failures during header generation: log and continue sending (never block mail because of the
  opt-out table).
- DB failures during suppression check: log and continue (send anyway) — never silently drop mail.

## Testing

- Local: send a branded email with a token; verify `List-Unsubscribe` header present and
  `reply_to` set (inspect Resend response / the stored email).
- Local: `curl` GET the unsubscribe URL (branded page), POST one-click (200), re-send to the same
  address and confirm it is skipped.
- Local: `curl` POST `/api/mail/subscribe` then confirm sends resume.
- Live: send to a real Gmail, view "Show original" → confirm `List-Unsubscribe` +
  `List-Unsubscribe-Post` headers and Reply-To; click the unsubscribe link and confirm it works.
- Regression: composer send with attachment still succeeds (previous fix); notification/report
  sends still work.

## Files touched

- `backend/supabase/unsubscribes.sql` (new migration)
- `backend/src/services/notify.js` (headers, tokens, replyTo, suppression, cleanSubject)
- `backend/src/routes/mail.js` (public GET/POST unsubscribe + subscribe routes)
- `backend/.env.example` (BACKEND_URL, CONTACT_EMAIL docs)
- `backend/src/cron/monthlyReport.js`, `backend/src/routes/fileSend.js`,
  `backend/src/services/notify.js` transaction notification subject (content pass)
