# Operations test matrix

This matrix maps the Operations rollout and compatibility acceptance criteria to the command or test that exercises them. Offline checks do not require Supabase, payment, SMTP, WhatsApp, Telegram, Google, Render, or Vercel credentials.

## Executed offline checks

| Acceptance criterion | Evidence | Command |
|---|---|---|
| Existing API route mounts remain present | Compatibility test checks the legacy `/api/*` and `/api/webhooks` mount strings in `backend/src/server.js` | `node --test backend/test/operationsCompatibility.test.js` |
| Existing migration files remain present | Compatibility test checks migrations `000` through `015` | `node --test backend/test/operationsCompatibility.test.js` |
| Existing frontend tests remain present | Compatibility test checks the OCR, auth, and Operations frontend test files | `node --test backend/test/operationsCompatibility.test.js` |
| Operations flags are disabled by default | `operationsPermissions.test.js` and compatibility test assert all seven flags are false for an empty environment | `npm --prefix backend test` |
| Legacy webhook success keys remain present | Compatibility test checks `success`, `alreadyExists`, and `transactionId` in the existing donation webhook response paths | `node --test backend/test/operationsCompatibility.test.js` |
| Operations migrations are additive | Schema contract and compatibility tests reject `DROP TABLE`, `DROP COLUMN`, and `ALTER TABLE ... DROP` in migrations `016` through `019` | `npm --prefix backend test` |
| Migration discovery and dry-run are offline | The runner lists numeric migrations, validates SQL, and executes no SQL in dry-run/contract modes | `node backend/src/migrations/run-migrations.js --dry-run` and `node backend/src/migrations/run-migrations.js --contract` |
| Schema contract covers Operations tables, roles, and statuses | `operationsSchemaContract.test.js` checks the table set, role set, statuses, and destructive-DDL guard | `npm --prefix backend test -- --test-name-pattern="operations schema"` |
| Approval and posting invariants hold | Posting/approval tests cover positive amounts, pending approval, Admin-only posting, balanced journals, and reversal preservation | `npm --prefix backend test -- --test-name-pattern="operations posting|operations approval"` |
| Verified donation idempotency and offline approval hold | Donation tests cover payment-key idempotency, shared people, gateway separation, and offline donations without posted journals | `npm --prefix backend test -- --test-name-pattern="operations donation"` |
| Receipt/invoice documents and delivery retries are safe | Document/delivery tests cover unique numbers, PDF content, one combined email, bounded retry, permanent failure, and a batch limit of 25 | `npm --prefix backend test -- --test-name-pattern="operations document|operations delivery"` |
| Fund balances and transfers are trust-safe | Fund tests cover allocations, commitments, transfers, negative/ineligible/cross-trust rejection, and Viewer read-only behavior | `npm --prefix backend test -- --test-name-pattern="operations fund"` |
| Invoice lifecycle and payment allocation are safe | Invoice tests cover totals, approval, payment, overdue, overpayment, rejection, cancellation/reissue, and trust/person validation | `npm --prefix backend test -- --test-name-pattern="operations invoice"` |
| Payroll calculations and approval are deterministic | Payroll tests cover configured INR deductions, validation, versioned salary structures, approval/posting, payslips, and idempotent payments | `npm --prefix backend test -- --test-name-pattern="operations payroll"` |
| Reports do not cross trust boundaries | Report tests cover trust isolation, consolidated labels, de-duplication, and filters | `npm --prefix backend test -- --test-name-pattern="operations report"` |
| Audit and delivery monitoring are trust-safe | Audit tests cover Viewer reads, delivery counts, bounded errors, retry authorization, and trust isolation | `npm --prefix backend test -- --test-name-pattern="operations audit"` |
| Operations frontend contract file remains available | Compatibility test preserves the Operations page test file; the current Node-only frontend script does not execute `.jsx` files | `node --test backend/test/operationsCompatibility.test.js` |
| Existing frontend behavior remains covered | Existing OCR and authentication tests run through the frontend package script | `npm --prefix frontend test` |
| Frontend lint and build are checked | Existing frontend lint/build commands run without external services; lint completes with non-blocking warnings and the production build completes with known Vite bundle warnings | `npm run lint` and `npm run build` |
| Repository test contract is reproducible | Root runner executes frontend tests, backend tests, lint, and build with the repository root as working directory | `npm test` |

## CI command order

`.github/workflows/operations-checks.yml` runs these real commands on a clean checkout:

```bash
npm ci
npm --prefix frontend ci
npm --prefix backend ci
node --test backend/test/operationsCompatibility.test.js
node backend/src/migrations/run-migrations.js --dry-run
node backend/src/migrations/run-migrations.js --contract
npm test
npm run lint
npm run build
```

No step reports an unavailable external service as successful. The workflow supplies no private credentials.

## Integration-only checks

These acceptance areas need an authorized disposable or staging environment and are intentionally excluded from offline CI:

| Area | Required evidence |
|---|---|
| Supabase schema apply | Apply `node backend/src/migrations/run-migrations.js up` to a disposable database and inspect RLS, triggers, functions, and indexes |
| Supabase Auth/RLS | Log in with Admin, Accountant, and Viewer identities and verify row/action permissions through the deployed API |
| Payment gateway | Send a signed test webhook twice and confirm one payment event, donation, transaction, document set, and delivery event |
| Real document delivery | Confirm provider delivery, retry behavior, attachment rendering, and recipient receipt in a controlled mailbox |
| Deployment | Verify Render API health, Vercel SPA routes, CORS, login, and webhook connectivity after deployment |
| Provider integrations | Verify only the providers enabled for the deployment: WhatsApp, Telegram, Google Drive, SMTP/HTTPS mail, and payment gateway |

Run and record these checks separately. Do not put credentials or raw provider payloads in test fixtures, CI logs, or this matrix.

## Current coverage boundaries

- The default frontend package script runs the existing OCR and auth tests; the Operations page contract test is run directly by CI and the rollout checklist.
- Offline tests use fakes/injected adapters for external delivery and do not prove provider availability or a production payment signature.
- Migration dry-run and contract checks validate file discovery and destructive-DDL safety; only an authorized database apply validates PostgreSQL execution, RLS, and trigger behavior.
- Configured legal identifiers, branding, payment settings, sender email, and statutory payroll rules require accountant/operator validation in deployment configuration.
- Repository lint has no blocking errors. It still reports non-blocking warnings in legacy screens/shared components, and the production build reports known Vite browser-externalization and large-chunk warnings.
