# Operations rollout runbook

This runbook deploys the additive Operations module without changing the existing Trust CRM workflow. Operations is disabled unless an explicitly named feature flag is set to the exact value `true`.

## Required rollout sequence

Follow this sequence in order:

```text
schema with flags disabled → existing checks → deploy API/frontend → verify login/routes/webhook → enable trust read-only → enable approvals → test donation documents → enable funds/invoices/payroll → monitor delivery and audit
```

The sequence is deliberately staged. Do not enable all Operations flags in one deployment or use production payment/email credentials for the offline checks.

## Before the first deployment

1. Confirm the API and frontend still use the pinned Node.js version in `.nvmrc`.
2. Copy the relevant environment templates and supply values through the approved deployment configuration store. Do not put secrets, private payloads, payment signatures, or service-role keys in source, fixtures, logs, or this runbook.
3. Keep every Operations flag disabled in API and frontend environments:

   | Capability | Backend flag | Frontend flag | Initial value |
   |---|---|---|---|
   | Trusts | `ENABLE_OPERATIONS_TRUSTS` | `VITE_ENABLE_OPERATIONS_TRUSTS` | `false` |
   | Donation automation | `ENABLE_OPERATIONS_DONATIONS_AUTOMATION` | `VITE_ENABLE_OPERATIONS_DONATIONS_AUTOMATION` | `false` |
   | Approvals | `ENABLE_OPERATIONS_APPROVALS` | `VITE_ENABLE_OPERATIONS_APPROVALS` | `false` |
   | Funds | `ENABLE_OPERATIONS_FUNDS` | `VITE_ENABLE_OPERATIONS_FUNDS` | `false` |
   | Invoices | `ENABLE_OPERATIONS_INVOICES` | `VITE_ENABLE_OPERATIONS_INVOICES` | `false` |
   | Payroll | `ENABLE_OPERATIONS_PAYROLL` | `VITE_ENABLE_OPERATIONS_PAYROLL` | `false` |
   | Automation monitoring | `ENABLE_OPERATIONS_AUTOMATION_MONITOR` | `VITE_ENABLE_OPERATIONS_AUTOMATION_MONITOR` | `false` |

## Deployment steps

### 1. Schema with flags disabled

From the repository root, install from lockfiles and inspect the complete migration set without connecting to Supabase:

```bash
npm ci
npm --prefix frontend ci
npm --prefix backend ci
node backend/src/migrations/run-migrations.js --dry-run
node backend/src/migrations/run-migrations.js --contract
```

In the authorized database environment, apply the migrations through the existing migration runner while all Operations flags remain disabled:

```bash
node backend/src/migrations/run-migrations.js up
```

For a completely new Supabase project, generate the one-file SQL Editor bundle
instead:

```bash
npm run db:bundle
```

Paste `supabase/combined-schema.sql` into the Supabase SQL Editor and run it
once. It contains all migrations `000` through `019` in order and records the
versions in `public.schema_migrations`. Do not use this bundle for a database
that already contains migration history; use the runner so already-applied
versions are skipped safely.

If the existing CRM database already has baseline migrations `000` through
`015`, the SQL Editor alternative is the Operations-only bundle:

```bash
npm run db:bundle:operations
```

Paste `supabase/operations-schema.sql` into the SQL Editor. It applies only
`016` through `019`, creates `public.schema_migrations` when the legacy CRM is
missing it, and records those versions in the tracking table.

The Operations migrations are additive and use the `operations_` namespace. Keep a database backup/export according to the existing operational policy before applying them.

### 2. Existing checks

Run the repository checks before deployment:

```bash
npm test
npm run lint
npm run build
node --test backend/test/operationsCompatibility.test.js
```

These checks do not need Supabase, payment, SMTP, WhatsApp, Telegram, Google, or other external credentials.

### 3. Deploy API/frontend

Build and run the API container using the deployment environment, or deploy the backend through the existing Render target:

```bash
docker build -t trust-crm .
docker run --env-file backend/.env -p 8888:8888 trust-crm
git push origin main
```

Deploy the frontend through the existing Vercel target:

```bash
cd frontend
vercel --prod
```

Keep the Operations flags disabled during this deployment. Set `VITE_API_URL` to the deployed API URL in the frontend deployment configuration.

### 4. Verify login/routes/webhook

Verify the current CRM login and at least one existing authenticated screen. Confirm the API health endpoint and the legacy webhook contract:

```bash
curl --fail https://<api-host>/health
```

The existing route mounts and the `POST /api/webhooks/website-donation` success keys (`success`, `alreadyExists` for an idempotent repeat, and `transactionId`) must remain available. Use a signed, non-production webhook fixture in an authorized test environment; do not paste a real signature or private payment payload into a report.

With flags still disabled, Operations endpoints should remain unavailable through their feature guard. Existing CRM routes must continue to work.

### 5. Enable trust read-only

Enable only `ENABLE_OPERATIONS_TRUSTS=true` and its matching `VITE_` flag. Seed or configure the three trusts in the Operations tables with safe display fields, then sign in as a Viewer and confirm:

- all three trusts can be selected for read-only views;
- the Viewer cannot create, edit, approve, post, reverse, or retry records;
- no secrets, service-role configuration, SMTP settings, or webhook keys appear in responses.

Keep donations automation, approvals, funds, invoices, payroll, and monitoring disabled at this stage.

### 6. Enable approvals

After the trust read-only check, enable `ENABLE_OPERATIONS_APPROVALS=true` and its matching frontend flag. Verify the role boundaries with non-production records:

- Accountant can create and submit a manual record but cannot approve it;
- Admin can approve/reject/post/reverse according to the approval state machine;
- a posted journal remains immutable and a correction creates a reversal chain;
- Viewer remains read-only.

### 7. Test donation documents

Enable donation automation and automation monitoring only in a test/staging environment:

```text
ENABLE_OPERATIONS_DONATIONS_AUTOMATION=true
ENABLE_OPERATIONS_AUTOMATION_MONITOR=true
```

Use a verified test donation fixture and the injected/fake mail adapter covered by the offline delivery tests. Confirm that one payment event creates one donation, one receipt, one invoice, one combined delivery event, and one email attempt with two attachments. Exercise a temporary provider failure and confirm a bounded retry without duplicate documents. The legacy webhook must still return its existing success payload without waiting for PDF or email success.

### 8. Enable funds/invoices/payroll

Enable each domain one at a time, in this order, after its acceptance checks pass:

1. `ENABLE_OPERATIONS_FUNDS` and `VITE_ENABLE_OPERATIONS_FUNDS`;
2. `ENABLE_OPERATIONS_INVOICES` and `VITE_ENABLE_OPERATIONS_INVOICES`;
3. `ENABLE_OPERATIONS_PAYROLL` and `VITE_ENABLE_OPERATIONS_PAYROLL`.

For each domain, verify trust isolation, role permissions, approval requirements, balanced posting, and its read-only views before enabling the next flag. Payroll remains configurable until the Trust's accountant validates the applicable TDS, PF, ESI, and professional-tax rules.

### 9. Monitor delivery and audit

Keep `ENABLE_OPERATIONS_AUTOMATION_MONITOR=true` only when the worker and monitoring endpoints are ready. Monitor:

- pending, processing, retrying, sent/completed, and failed document deliveries;
- attempt counts, next-attempt timestamps, bounded last errors, and retryable counts;
- audit events for actor, trust, entity, action, reason, request ID, and request IP;
- trust-separated consolidated reports and the absence of duplicate donation, invoice, payroll, or reversal rows.

Use the Operations audit and delivery-health endpoints and the existing platform logs. Alert on repeated permanent failures, growing retry queues, missing audit events, or cross-trust data in a response.

## Test mode and external integration checks

Test mode means feature flags are enabled only in a disposable or staging environment, using fixture identities, test payment events, and injected fake mail/storage adapters. The repository's Node tests, migration dry-run, lint, and build remain offline and must not claim that a payment gateway, SMTP provider, WhatsApp, Telegram, Google, or Supabase service is healthy.

The following checks are integration-only and require an authorized environment with the relevant credentials:

- applying migrations to a disposable Supabase/PostgreSQL database;
- Supabase Auth login and RLS behavior;
- a signed payment gateway webhook and gateway idempotency;
- PDF storage and real email provider delivery;
- Render/Vercel deployment and health checks;
- WhatsApp, Telegram, Google Drive, or other provider delivery.

Record these results separately from the offline CI checks and redact provider responses and identifiers.

## Rollback

1. Stop enabling new flags and disable the most recently enabled domain in both API and frontend configuration.
2. If document delivery is at risk, disable `ENABLE_OPERATIONS_AUTOMATION_MONITOR` after recording the queue state; preserve pending events for a controlled retry rather than creating duplicate documents.
3. Roll back the API/frontend deployment to the last known-good image or release, then verify the existing login, routes, and webhook again.
4. Keep the additive Operations schema and audit records in place while the application is rolled back. Do not drop Operations tables or alter existing CRM tables as a rollback shortcut.
5. Reconcile any approved/posting activity from the audit trail. Use reversal/cancellation and replacement records for posted financial facts; never edit or delete a posted journal.
6. Re-enable a flag only after the failure is understood, the compatibility checks pass, and the affected integration has been retested in the authorized environment.

## Configuration-only values

These values are deployment/database configuration, never source-code constants:

- trust names, legal names, registration identifiers, PAN, 80G, and 12A values;
- trust logo, address, branding, and document template settings;
- payment gateway selection, webhook configuration, and payment identifiers;
- sender email, reply-to email, SMTP/HTTPS provider settings, and delivery credentials;
- INR/time-zone/financial-year defaults and statutory payroll rules for TDS, PF, ESI, and professional tax.

The accountant must validate legal and statutory values before official documents, reports, or payroll runs are enabled.
