# Trust Operations Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use a task-by-task implementation workflow with review checkpoints. Each task below is independently testable and must be verified before the next task begins.

**Goal:** Add three-trust donations, approvals, funds, invoices, payroll, and immediate receipt/invoice email automation to the existing Trust CRM without replacing or overwriting its current behavior.

**Architecture:** Keep the current React/Vite + Express + Supabase/PostgreSQL stack. Add an `operations_*` database namespace, a versioned `/api/v2/operations/*` API, isolated domain services, an atomic posting/approval boundary, and an outbox for document/email delivery. Existing routes, tables, webhook behavior, and screens remain available and are not made dependent on the new modules.

**Tech Stack:** React 19, Vite, Tailwind CSS, React Router, Node.js/Express, Supabase Auth, Supabase/PostgreSQL, Node `node:test`, PDFKit, existing Nodemailer/Resend notification infrastructure, and existing Vercel/Render deployment targets.

## Global Constraints

- The existing CRM is additive-only: no existing table is dropped, no existing column is removed or repurposed, no existing route is renamed or removed, and no existing record is deleted by the new modules.
- New functionality is disabled by default with `ENABLE_OPERATIONS_TRUSTS`, `ENABLE_OPERATIONS_DONATIONS_AUTOMATION`, `ENABLE_OPERATIONS_APPROVALS`, `ENABLE_OPERATIONS_FUNDS`, `ENABLE_OPERATIONS_INVOICES`, `ENABLE_OPERATIONS_PAYROLL`, and `ENABLE_OPERATIONS_AUTOMATION_MONITOR`.
- Exactly three global roles are supported: `admin`, `accountant`, and `viewer`; all roles can access all three trusts, with permissions determined by role.
- Approval is mandatory for manually entered financial records; verified online donations are the only automatic-posting exception.
- Receipt and invoice are sent together in one email immediately after a verified online payment, with retryable delivery and no duplicate documents.
- New financial facts are trust-scoped and new posted journals must satisfy `sum(debits) = sum(credits)`.
- Posted records are immutable; corrections use reversal/cancellation and replacement records with an audit chain.
- Indian defaults are INR, `Asia/Kolkata`, and April–March financial year; PAN, 80G, 12A, TDS, PF, ESI, and professional-tax fields are configurable and must be validated by the Trust's accountant.
- Existing payment and email integrations are preserved and extended rather than replaced.
- Secrets, service-role keys, payment signatures, SMTP credentials, and raw private payloads must not enter source files, fixtures, logs, or reports.
- Run the smallest meaningful test after every task. Do not report a check as passed unless its command ran successfully.

---

## Task 1: Establish a safe baseline and reproducible checks

**Files:**
- Create: `.nvmrc`
- Create: `Dockerfile`
- Create: `package.json`
- Create: `package-lock.json`
- Create: `scripts/test-all.mjs`
- Create: `scripts/verify-additive-schema.mjs`
- Modify: `frontend/package.json`
- Modify: `backend/package.json`
- Modify: `README.md`
- Test: `scripts/test-all.test.mjs`

**Interfaces:**
- Produces the single project check command `npm test` from the repository root.
- Produces `npm run test:frontend`, `npm run test:backend`, `npm run lint`, and `npm run build` wrappers without changing existing frontend behavior.
- `scripts/test-all.mjs` must run child processes with the repository root as the working directory and exit non-zero on the first failed check.

- [ ] **Step 1: Record the current baseline.**

Run:

```bash
npm --prefix frontend test
npm --prefix frontend run lint
npm --prefix frontend run build
```

Expected: capture the actual result of each command before adding new code. Existing failures remain visible in the handoff and are not hidden by no-op scripts.

- [ ] **Step 2: Pin the runtime used by the repository.**

Create `.nvmrc` containing `24.19.0`, matching the verified local runtime and supported by React 19, Vite 8, and the existing backend dependencies. Add a matching `engines.node` range to the root package metadata without changing the frontend or backend dependency versions.

- [ ] **Step 3: Add the root test runner.**

Create `scripts/test-all.mjs` with this command order:

```js
const checks = [
  ['frontend tests', 'npm', ['--prefix', 'frontend', 'test']],
  ['backend tests', 'npm', ['--prefix', 'backend', 'test']],
  ['frontend lint', 'npm', ['--prefix', 'frontend', 'run', 'lint']],
  ['frontend build', 'npm', ['--prefix', 'frontend', 'run', 'build']],
];
```

Use `spawnSync` with `stdio: 'inherit'`, preserve the first failing exit code, and do not run deployment commands.

- [ ] **Step 4: Add backend test scripts without changing production start.**

Add this backend script:

```json
"test": "node --test test/**/*.test.js"
```

Keep `start`, `dev`, and `postinstall` unchanged. Add the root `package.json` scripts:

```json
"test": "node scripts/test-all.mjs",
"test:frontend": "npm --prefix frontend test",
"test:backend": "npm --prefix backend test",
"lint": "npm --prefix frontend run lint",
"build": "npm --prefix frontend run build"
```

- [ ] **Step 5: Add the Docker build contract.**

The Dockerfile must install project dependencies from `frontend/package-lock.json` and `backend/package-lock.json`, build the frontend, and start the backend. Do not install global packages or use absolute paths tied to this workstation. Document required environment variables using existing `.env.example` files only.

- [ ] **Step 6: Add a failing test for the runner contract, then implement it.**

Create `scripts/test-all.test.mjs` that imports a pure `buildChecks()` export from `scripts/test-all.mjs` and asserts the four expected labels and command arrays. Keep process execution behind `runChecks()` so the test is offline.

Run:

```bash
node --test scripts/test-all.test.mjs
```

Expected: PASS after implementation.

- [ ] **Step 7: Update README setup and checks.**

Document exact commands from the repository root:

```bash
npm ci
npm test
npm run lint
npm run build
```

Document that the operations module is disabled by default and does not require new credentials for the existing CRM.

- [ ] **Step 8: Verify the baseline contract.**

Run:

```bash
npm test
```

Expected: the command reports the actual status of frontend, backend, lint, and build checks. Do not proceed until failures are recorded and either fixed or explicitly bounded in the implementation notes.

- [ ] **Step 9: Commit.**

```bash
git add .nvmrc Dockerfile package.json package-lock.json scripts frontend/package.json backend/package.json README.md
git commit -m "chore: add reproducible project checks"
```

## Task 2: Add the additive operations schema and RLS contract

**Files:**
- Create: `backend/src/migrations/016_operations_foundation.sql`
- Create: `backend/src/migrations/017_operations_security.sql`
- Create: `backend/src/migrations/018_operations_sequences.sql`
- Create: `backend/src/operations/schemaContract.js`
- Create: `backend/test/operationsSchemaContract.test.js`
- Modify: `backend/src/migrations/run-migrations.js`
- Modify: `README.md`

**Interfaces:**
- `schemaContract.js` exports `OPERATIONS_TABLES`, `OPERATIONS_ROLES`, `OPERATIONS_STATUSES`, and `assertOperationsMigrationText(sqlText)`.
- The SQL migrations create only additive objects named with the `operations_` prefix.
- `operations_trusts.id` is referenced by every trust-owned operations table.
- RLS policies use authenticated identity and the existing `profiles.role`; service-role access is backend-only.

- [ ] **Step 1: Write schema contract tests.**

Test that the migration set contains these tables:

```js
[
  'operations_trusts', 'operations_trust_settings',
  'operations_people', 'operations_trust_people',
  'operations_transactions', 'operations_journal_entries',
  'operations_journal_lines', 'operations_approval_requests',
  'operations_approval_actions', 'operations_audit_events',
  'operations_funds', 'operations_fund_budgets',
  'operations_fund_allocations', 'operations_fund_commitments',
  'operations_fund_transfers', 'operations_payment_events',
  'operations_donations', 'operations_donation_allocations',
  'operations_invoices', 'operations_invoice_lines',
  'operations_receipts', 'operations_document_deliveries',
  'operations_number_sequences', 'operations_employees',
  'operations_salary_structures', 'operations_salary_components',
  'operations_payroll_periods', 'operations_payroll_runs',
  'operations_payroll_lines', 'operations_payroll_adjustments',
  'operations_payslips', 'operations_payroll_payments',
  'operations_automation_events'
]
```

Also assert that no migration contains `DROP TABLE`, `DROP COLUMN`, or `ALTER TABLE ... DROP`.

- [ ] **Step 2: Implement the schema contract helper.**

Read only migration files supplied by the caller, normalize whitespace, detect the forbidden destructive patterns, and throw an error containing the file name and matched statement. Keep this helper free of Supabase dependencies.

- [ ] **Step 3: Create foundation tables.**

Create trust, settings, people, trust relationships, transactions, approvals, audits, and automation event tables. Use UUID primary keys, `timestamptz` audit columns, numeric monetary amounts with explicit currency, and check constraints for positive amounts and valid statuses.

Each trust-owned table must include `trust_id uuid NOT NULL REFERENCES operations_trusts(id)` and an index beginning with `trust_id` plus the primary business filter, such as date or status.

- [ ] **Step 4: Create accounting, fund, donation, document, invoice, and payroll tables.**

Create the tables listed in the Interfaces block. Include explicit foreign keys between donations, payment events, people, trust, transaction, receipt, invoice, fund allocations, approval requests, journal entries, and audit events. Do not add required columns to existing tables.

- [ ] **Step 5: Add RLS and immutable-posted constraints.**

Enable RLS on operations tables. Add policies for authenticated users with roles `admin`, `accountant`, and `viewer`. Allow read access according to role, write access only for admin/accountant, and approval/post/reversal actions only for admin. Add database triggers or guarded functions that reject updates/deletes to posted journals, sent documents, and completed payment events.

- [ ] **Step 6: Add atomic number sequences.**

Create `operations_next_number(p_trust_id uuid, p_document_type text, p_financial_year text) returns text` using a row lock on `operations_number_sequences`. The function must increment a counter under concurrency and return a trust/year-scoped receipt or invoice number. It must not call `MAX()`.

- [ ] **Step 7: Add migration runner support.**

Update the existing runner so operations migrations are discovered in numeric order and documented in the same migration path. Preserve existing migration files and behavior. Add a dry-run mode that prints files and checks destructive statements without executing SQL.

- [ ] **Step 8: Run schema contract tests.**

Run:

```bash
npm --prefix backend test -- --test-name-pattern="operations schema"
```

Expected: PASS offline. If Supabase credentials are available in the authorized environment, run the migration dry-run and a disposable schema apply; never log credentials.

- [ ] **Step 9: Commit.**

```bash
git add backend/src/migrations backend/src/operations/schemaContract.js backend/test/operationsSchemaContract.test.js README.md
git commit -m "feat: add additive operations schema"
```

## Task 3: Add feature flags, operations authorization, and trust context

**Files:**
- Create: `backend/src/operations/featureFlags.js`
- Create: `backend/src/operations/permissions.js`
- Create: `backend/src/middlewares/operationsAuth.js`
- Create: `backend/src/routes/operationsTrusts.js`
- Create: `backend/test/operationsPermissions.test.js`
- Create: `frontend/src/lib/OperationsContext.jsx`
- Create: `frontend/src/lib/operationsFlags.js`
- Modify: `backend/src/server.js`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/Nav.jsx`

**Interfaces:**
- `isOperationsEnabled(name, env = process.env)` returns a boolean and defaults all new flags to `false`.
- `can(role, action)` returns a boolean for `admin`, `accountant`, or `viewer`.
- `requireOperationsFeature(feature)` rejects disabled feature routes with HTTP 404, preserving the existing API surface.
- `requireOperationsRole(...roles)` rejects unauthorized operations actions with HTTP 403.
- `OperationsContext` exposes `{ enabled, trusts, selectedTrustId, setSelectedTrustId, loading, error }`.

- [ ] **Step 1: Write permission tests.**

Assert the exact matrix:

```js
can('admin', 'manage_users') === true;
can('accountant', 'manage_users') === false;
can('accountant', 'manage_finance') === true;
can('viewer', 'read_operations') === true;
can('viewer', 'manage_finance') === false;
can('accountant', 'approve_record') === false;
can('admin', 'approve_record') === true;
```

Assert that unknown roles and actions return `false`, not an implicit grant.

- [ ] **Step 2: Implement feature flag parsing.**

Treat only the exact value `"true"` as enabled. Keep a named map for all seven flags. Do not read secrets or payment keys through the frontend flag module.

- [ ] **Step 3: Implement server authorization middleware.**

Use the existing authentication middleware to load `req.user` and `req.profile`. Add `req.operationsTrustId` from the validated `trust_id` query/header/body value. The middleware must reject missing or malformed trust IDs, but must not allow a client-provided ID to bypass the selected trust's existence or role checks.

- [ ] **Step 4: Add trust API endpoints.**

Mount the new router at `/api/v2/operations/trusts` and implement:

```text
GET  /api/v2/operations/trusts
POST /api/v2/operations/trusts          admin only
PATCH /api/v2/operations/trusts/:id     admin only
```

The list endpoint returns active trusts and safe display fields. It must never return secrets, SMTP settings, webhook keys, or service-role configuration.

- [ ] **Step 5: Add frontend operations context.**

Load trust list only when Operations is enabled and the user is authenticated. Persist the selected trust ID in local storage only as a UI preference; reload and validate it against the API response. Provide an `All trusts` option for read-only consolidated views, but require one concrete trust for writes.

- [ ] **Step 6: Add additive navigation and routes behind flags.**

Add a collapsed Operations group to `Nav.jsx` without changing the existing `allItems` ordering behavior. Add a feature-gated Operations disabled-state route that explains the module is not enabled; later tasks replace that state with real module pages. Existing routes must render exactly as before when flags are disabled.

- [ ] **Step 7: Test authorization and flag behavior.**

Run:

```bash
node --test backend/test/operationsPermissions.test.js
npm --prefix frontend run build
```

Expected: permission tests pass and existing frontend build remains green.

- [ ] **Step 8: Commit.**

```bash
git add backend/src/operations backend/src/middlewares/operationsAuth.js backend/src/routes/operationsTrusts.js backend/test/operationsPermissions.test.js frontend/src/lib/OperationsContext.jsx frontend/src/lib/operationsFlags.js frontend/src/App.jsx frontend/src/components/Nav.jsx backend/src/server.js
git commit -m "feat: add operations roles and trust context"
```

## Task 4: Implement the approval and atomic posting foundation

**Files:**
- Create: `backend/src/migrations/019_operations_posting.sql`
- Create: `backend/src/operations/validation.js`
- Create: `backend/src/operations/postingService.js`
- Create: `backend/src/operations/approvalService.js`
- Create: `backend/src/routes/operationsApprovals.js`
- Create: `backend/test/operationsPosting.test.js`
- Create: `backend/test/operationsApproval.test.js`
- Modify: `backend/src/server.js`

**Interfaces:**
- `validateFinancialDraft(input)` returns `{ valid: true, value }` or `{ valid: false, errors }`.
- `createDraft({ actor, trustId, type, amount, currency, accountId, fundId, partyId, source, metadata })` returns a draft operations transaction ID.
- `submitForApproval({ actor, recordId })` returns the pending approval request.
- `approveAndPost({ actor, approvalId })` returns `{ transactionId, journalEntryId, fundAllocationId }`.
- `rejectApproval({ actor, approvalId, reason })` returns the rejected record.
- `reversePostedRecord({ actor, recordId, reason })` creates a reversal entry and never edits the original posted journal.

- [ ] **Step 1: Write validation and state-machine tests.**

Cover:

```js
validateFinancialDraft({ amount: 0 }).valid === false;
validateFinancialDraft({ amount: 100, type: 'debit' }).valid === false; // missing trust/account
validDraft.status === 'draft';
submitForApproval(draft).status === 'pending_approval';
rejectApproval(...).status === 'rejected';
```

Assert that a Viewer cannot create or submit, an Accountant cannot approve their own record, and only Admin can approve, reject, post, or reverse.

- [ ] **Step 2: Implement pure input validation.**

Validate positive finite monetary values, `credit`/`debit` type, supported currency, required trust/account, optional fund relationship, and bounded metadata. Return field-level errors suitable for the frontend.

- [ ] **Step 3: Add SQL posting functions.**

Create guarded database functions for approval and posting. The posting function must lock the target record, verify `pending_approval` plus an Admin approval action, create the journal and journal lines, verify debit/credit equality, create fund allocation if requested, mark the transaction posted, and append an audit event in one transaction.

- [ ] **Step 4: Implement service adapters.**

Implement `postingService.js` and `approvalService.js` around the Supabase client. Keep database access in these services so donation, fund, invoice, and payroll routes cannot implement their own posting logic.

- [ ] **Step 5: Add approval API.**

Mount `/api/v2/operations/approvals` with:

```text
GET  /api/v2/operations/approvals
POST /api/v2/operations/approvals/:id/submit
POST /api/v2/operations/approvals/:id/approve    admin only
POST /api/v2/operations/approvals/:id/reject     admin only
POST /api/v2/operations/records/:id/reverse      admin only
```

Every endpoint must enforce the approval feature flag and write an audit event with actor, action, record, reason, and request IP.

- [ ] **Step 6: Verify the accounting invariants.**

Run:

```bash
npm --prefix backend test -- --test-name-pattern="operations posting|operations approval"
```

Expected: unapproved records do not post, rejected records do not affect balances, posted journals balance, and reversal preserves the original.

- [ ] **Step 7: Commit.**

```bash
git add backend/src/migrations/019_operations_posting.sql backend/src/operations backend/src/routes/operationsApprovals.js backend/test/operationsPosting.test.js backend/test/operationsApproval.test.js backend/src/server.js
git commit -m "feat: add operations approvals and posting"
```

## Task 5: Extend verified donation processing without breaking the existing webhook

**Files:**
- Create: `backend/src/operations/donationService.js`
- Create: `backend/src/routes/operationsDonations.js`
- Create: `backend/test/operationsDonations.test.js`
- Modify: `backend/src/routes/webhookWebsiteDonation.js`
- Modify: `backend/src/server.js`

**Interfaces:**
- `paymentIdempotencyKey({ gateway, paymentId })` returns a stable key.
- `processVerifiedDonation({ payload, request, existingTransactionId })` returns `{ donationId, transactionId, status, automationEventId }`.
- `recordOfflineDonation(input)` always returns a draft that requires Admin approval.
- `findOrCreateSharedPerson({ donor, trustId })` reuses a normalized email/phone match before creating a person.

- [ ] **Step 1: Write idempotency tests.**

Assert that two calls with the same `gateway` and `payment_id` return the same payment event and donation IDs, create one operations transaction, and enqueue one automation event. Assert that different gateways with the same payment ID remain distinct.

- [ ] **Step 2: Write donor matching tests.**

Normalize email case and phone formatting. A matching existing person is reused; a new person is created only when no normalized email/phone match exists. Trust-specific relationships are added without duplicating the global person.

- [ ] **Step 3: Implement the operations donation service.**

Validate the existing webhook's secret/signature and positive amount before calling the service. Insert or lock `operations_payment_events`, create the donation and person relationship, create the posted credit through `postingService`, and enqueue exactly one document-generation event.

- [ ] **Step 4: Preserve the existing webhook response contract.**

Keep the existing `POST /api/webhooks/website-donation` route and its current successful JSON shape. When the automation flag is false, retain the current transaction-only behavior. When true, create the operations event after the existing transaction insert; do not make PDF/email success required for the webhook response.

- [ ] **Step 5: Add operations donation endpoints.**

Mount `/api/v2/operations/donations` with:

```text
GET  /api/v2/operations/donations
POST /api/v2/operations/donations/offline
GET  /api/v2/operations/donations/:id
```

Offline creation must return `pending_approval` and must not create a posted journal.

- [ ] **Step 6: Run donation tests and compatibility checks.**

Run:

```bash
npm --prefix backend test -- --test-name-pattern="operations donation"
```

Expected: idempotency and donor tests pass, and existing frontend tests remain green.

- [ ] **Step 7: Commit.**

```bash
git add backend/src/operations/donationService.js backend/src/routes/operationsDonations.js backend/test/operationsDonations.test.js backend/src/routes/webhookWebsiteDonation.js backend/src/server.js
git commit -m "feat: add trust donation processing"
```

## Task 6: Generate receipt/invoice PDFs and deliver them through the existing email service

**Files:**
- Create: `backend/src/operations/documentNumberService.js`
- Create: `backend/src/operations/documentRenderer.js`
- Create: `backend/src/operations/documentDeliveryService.js`
- Create: `backend/src/cron/operationsAutomation.js`
- Create: `backend/test/operationsDocuments.test.js`
- Create: `backend/test/operationsDelivery.test.js`
- Modify: `backend/src/services/notify.js`
- Modify: `backend/src/server.js`

**Interfaces:**
- `nextDocumentNumber({ trustId, documentType, financialYear })` returns an atomic string number.
- `renderDonationReceipt({ trust, donation, receipt })` returns a PDF `Buffer`.
- `renderDonationInvoice({ trust, donation, invoice })` returns a PDF `Buffer`.
- `deliverDonationDocuments({ donationId })` returns `{ receiptId, invoiceId, deliveryId, status }`.
- `processAutomationBatch({ limit = 25, now = new Date() })` returns `{ processed, completed, retrying, failed }`.

- [ ] **Step 1: Write document number tests.**

Use a fake sequence repository to assert that concurrent calls for the same trust/document/year produce unique sequential values and that receipt and invoice sequences do not share a counter.

- [ ] **Step 2: Implement the number service.**

Call the database-backed `operations_next_number` function. Reject missing trust, document type, or financial year. Never generate a number using `MAX()` or an in-memory counter.

- [ ] **Step 3: Write PDF content tests.**

Render a fixture trust and donation and assert that the returned buffers are non-empty PDF documents. Parse the generated text through the existing PDF tooling or a test-only text extractor and assert the trust name, donor name, amount, payment date, receipt number, invoice number, and PAN/80G/12A labels are present when configured.

- [ ] **Step 4: Implement trust-branded PDF rendering.**

Use the existing `pdfkit` dependency. Keep `documentRenderer.js` pure except for its input data. Render receipt and invoice as separate immutable artifacts and persist them through the existing storage adapter or the selected configured storage path without exposing service credentials.

- [ ] **Step 5: Write email delivery tests.**

Inject a fake mail adapter and assert one email call with two attachments, the expected subject, recipient, and delivery record. Test a temporary provider error transitions to `retrying`, sets a bounded next attempt, and does not create a second receipt or invoice.

- [ ] **Step 6: Implement delivery and retry logic.**

Use the existing `notify.js` transport abstraction. Add a single combined email operation with:

```text
Subject: Donation receipt and invoice – <Trust Name>
Attachments: receipt PDF, invoice PDF
```

Store `pending`, `processing`, `sent`, `failed`, and `retrying` states. Classify invalid recipient addresses as permanent failures and provider/network errors as retryable. Keep provider error messages redacted and bounded.

- [ ] **Step 7: Add the automation worker.**

Create a bounded cron processor that claims pending events with a lock, processes at most 25 events per batch, and releases or retries events safely. Start it only when `ENABLE_OPERATIONS_AUTOMATION_MONITOR` is true. A worker failure must not stop the Express server.

- [ ] **Step 8: Run document and delivery tests.**

Run:

```bash
npm --prefix backend test -- --test-name-pattern="operations document|operations delivery"
```

Expected: unique numbers, valid PDFs, one combined email, and retry behavior pass offline.

- [ ] **Step 9: Commit.**

```bash
git add backend/src/operations/documentNumberService.js backend/src/operations/documentRenderer.js backend/src/operations/documentDeliveryService.js backend/src/cron/operationsAutomation.js backend/test/operationsDocuments.test.js backend/test/operationsDelivery.test.js backend/src/services/notify.js backend/src/server.js
git commit -m "feat: add donation document delivery"
```

## Task 7: Add fund management and fund-aware reporting

**Files:**
- Create: `backend/src/operations/fundService.js`
- Create: `backend/src/routes/operationsFunds.js`
- Create: `backend/test/operationsFunds.test.js`
- Modify: `backend/src/server.js`
- Create: `frontend/src/pages/operations/OperationsFunds.jsx`
- Create: `frontend/src/pages/operations/OperationsFundDetail.jsx`

**Interfaces:**
- `createFund({ actor, trustId, name, type, openingBalance, budget })` returns a draft fund.
- `allocateToFund({ actor, recordId, fundId, amount })` validates trust and eligibility.
- `createFundTransfer({ actor, fromFundId, toFundId, amount, reason })` returns a pending approval record.
- `getFundSummary({ trustId, dateRange })` returns opening, received, spent, committed, available, and budget-versus-actual values.

- [ ] **Step 1: Write fund invariant tests.**

Assert donation allocation increases available balance, approved expense allocation decreases available balance, commitments reduce available balance without changing spent, and a transfer changes both funds atomically. Assert that cross-trust funds, negative amounts, and ineligible expenses are rejected.

- [ ] **Step 2: Implement the fund service.**

Use the posting service and database constraints for all balance-affecting operations. Store allocation rows rather than mutable balance-only snapshots; calculate summaries from posted records and approved commitments.

- [ ] **Step 3: Add fund APIs.**

Mount `/api/v2/operations/funds` with:

```text
GET  /api/v2/operations/funds
POST /api/v2/operations/funds
GET  /api/v2/operations/funds/:id
POST /api/v2/operations/funds/:id/transfer
GET  /api/v2/operations/funds/:id/summary
```

Creating a fund and creating a transfer require Admin approval where they affect official balances. Viewer endpoints remain read-only.

- [ ] **Step 4: Add fund pages.**

Use existing table, modal, toast, and layout patterns. Add trust selector, fund type, status, balance summary, allocation list, budget-versus-actual view, and transfer approval state. Do not alter the existing Functions & Budget page.

- [ ] **Step 5: Run fund checks.**

Run:

```bash
npm --prefix backend test -- --test-name-pattern="operations fund"
npm --prefix frontend run build
```

Expected: fund invariants pass and the existing frontend remains buildable.

- [ ] **Step 6: Commit.**

```bash
git add backend/src/operations/fundService.js backend/src/routes/operationsFunds.js backend/test/operationsFunds.test.js backend/src/server.js frontend/src/pages/operations
git commit -m "feat: add trust fund management"
```

## Task 8: Add the invoice lifecycle and payment allocation

**Files:**
- Create: `backend/src/operations/invoiceService.js`
- Create: `backend/src/routes/operationsInvoices.js`
- Create: `backend/test/operationsInvoices.test.js`
- Create: `frontend/src/pages/operations/OperationsInvoices.jsx`
- Create: `frontend/src/pages/operations/OperationsInvoiceDetail.jsx`
- Modify: `backend/src/server.js`

**Interfaces:**
- `createInvoiceDraft(input)` returns an invoice in `draft` status.
- `submitInvoiceForApproval({ actor, invoiceId })` returns `pending_approval`.
- `approveAndSendInvoice({ actor, invoiceId })` returns `{ invoiceId, documentDeliveryId }`.
- `recordInvoicePayment({ actor, invoiceId, amount, paymentReference })` returns the updated payment status and journal IDs.
- `cancelAndReissueInvoice({ actor, invoiceId, reason })` returns `{ cancelledInvoiceId, replacementInvoiceId }`.

- [ ] **Step 1: Write invoice state and amount tests.**

Cover Draft → Approved → Sent → Partially paid → Paid, overdue calculation by due date, rejection before sending, cancellation/reissue after sending, exact line-item totals, and prevention of overpayment.

- [ ] **Step 2: Implement invoice service.**

Use trust/year number allocation. Validate donor/vendor/customer identity, line items, positive quantities and rates, tax fields where configured, due date, and currency. Do not edit sent invoices. Payment allocations must create accounting events through the posting service.

- [ ] **Step 3: Add invoice API.**

Mount `/api/v2/operations/invoices` with:

```text
GET  /api/v2/operations/invoices
POST /api/v2/operations/invoices
GET  /api/v2/operations/invoices/:id
POST /api/v2/operations/invoices/:id/submit
POST /api/v2/operations/invoices/:id/approve
POST /api/v2/operations/invoices/:id/payment
POST /api/v2/operations/invoices/:id/cancel-and-reissue
```

Admin approval is mandatory before an invoice is sent. The existing donation automation may create its donation invoice as part of the verified-payment exception.

- [ ] **Step 4: Add invoice pages.**

Show trust, person, number, line items, totals, due date, status, payment history, receipt/invoice document links, and delivery events. Use the existing CRM visual language and keep the page behind `ENABLE_OPERATIONS_INVOICES`.

- [ ] **Step 5: Run invoice checks.**

Run:

```bash
npm --prefix backend test -- --test-name-pattern="operations invoice"
npm --prefix frontend run build
```

- [ ] **Step 6: Commit.**

```bash
git add backend/src/operations/invoiceService.js backend/src/routes/operationsInvoices.js backend/test/operationsInvoices.test.js backend/src/server.js frontend/src/pages/operations
git commit -m "feat: add operations invoices"
```

## Task 9: Add payroll management with approval and accounting integration

**Files:**
- Create: `backend/src/operations/payrollService.js`
- Create: `backend/src/routes/operationsPayroll.js`
- Create: `backend/test/operationsPayroll.test.js`
- Create: `frontend/src/pages/operations/OperationsPayroll.jsx`
- Create: `frontend/src/pages/operations/OperationsEmployees.jsx`
- Modify: `backend/src/server.js`

**Interfaces:**
- `createEmployee({ actor, trustId, personId, employeeCode, startDate })` returns an active employee.
- `saveSalaryStructure({ actor, employeeId, components, effectiveFrom })` returns a versioned salary structure.
- `preparePayrollRun({ actor, trustId, period, employeeIds })` returns a deterministic draft payroll run.
- `approvePayrollRun({ actor, payrollRunId })` returns the posted journal and payslip IDs.
- `recordPayrollPayment({ actor, payrollRunId, paymentReference })` returns the payment status.

- [ ] **Step 1: Write payroll calculation tests.**

Use fixed INR fixtures to assert gross salary, allowances, deductions, net pay, TDS, PF, ESI, and professional-tax fields. Assert repeated calculation with the same inputs is identical. Assert missing salary structure, duplicate employee in a period, negative components, and invalid period are rejected.

- [ ] **Step 2: Implement employee and salary services.**

Use `operations_people` for shared identity and `operations_employees` for trust-specific employment. Version salary structures by effective date. Store component types and amounts explicitly; never overwrite a prior structure used by an approved payroll run.

- [ ] **Step 3: Implement payroll run lifecycle.**

Create a draft run, calculate lines, require Admin approval, generate payslips, then post the debit/journal and fund allocation through the shared posting service. Payment status is separate from approval/posting status.

- [ ] **Step 4: Add Indian payroll fields and configuration.**

Support INR, Asia/Kolkata, April–March, and configurable TDS, PF, ESI, and professional-tax fields. Keep calculations explicitly marked configurable until the Trust's accountant supplies the applicable rules. Do not claim legal compliance from field presence alone.

- [ ] **Step 5: Add payroll APIs.**

Mount `/api/v2/operations/payroll` with:

```text
GET  /api/v2/operations/payroll/employees
POST /api/v2/operations/payroll/employees
PATCH /api/v2/operations/payroll/employees/:id
POST /api/v2/operations/payroll/salary-structures
GET  /api/v2/operations/payroll/runs
POST /api/v2/operations/payroll/runs
POST /api/v2/operations/payroll/runs/:id/approve
POST /api/v2/operations/payroll/runs/:id/payment
GET  /api/v2/operations/payroll/runs/:id/payslips
```

All write endpoints require Admin or Accountant; approval and posting require Admin except for the verified online donation exception, which does not apply to payroll.

- [ ] **Step 6: Add payroll pages.**

Add employee list, salary structure form, payroll period/run table, approval action, payslip links, deduction summary, and payment status. Keep sensitive employee documents behind authenticated API access and do not expose them in list responses.

- [ ] **Step 7: Run payroll checks.**

Run:

```bash
npm --prefix backend test -- --test-name-pattern="operations payroll"
npm --prefix frontend run build
```

- [ ] **Step 8: Commit.**

```bash
git add backend/src/operations/payrollService.js backend/src/routes/operationsPayroll.js backend/test/operationsPayroll.test.js backend/src/server.js frontend/src/pages/operations
git commit -m "feat: add operations payroll"
```

## Task 10: Build the additive Operations dashboard and shared UI

**Files:**
- Create: `frontend/src/pages/operations/OperationsDashboard.jsx`
- Create: `frontend/src/pages/operations/OperationsApprovals.jsx`
- Create: `frontend/src/pages/operations/OperationsAutomation.jsx`
- Create: `frontend/src/pages/operations/OperationsTrusts.jsx`
- Create: `frontend/src/components/operations/OperationsLayout.jsx`
- Create: `frontend/src/components/operations/TrustSelector.jsx`
- Create: `frontend/src/components/operations/StatusBadge.jsx`
- Create: `frontend/src/components/operations/DeliveryStatus.jsx`
- Create: `frontend/src/lib/operationsApi.js`
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/Nav.jsx`
- Create: `frontend/src/pages/operations/operationsPages.test.jsx`

**Interfaces:**
- `operationsApi.getSummary({ trustId, from, to })` returns dashboard totals.
- `operationsApi.getApprovals({ trustId, status })` returns approval rows.
- `OperationsLayout` requires `OperationsContext` and renders the existing header/layout conventions.
- `TrustSelector` accepts `{ trusts, value, onChange, allowAll, disabled }`.

- [ ] **Step 1: Write page contract tests.**

Test the trust selector renders three trust choices and All trusts, the Viewer sees no mutation buttons, the Accountant sees create/submit but no approve button, and Admin sees approve/reject/retry actions. Use existing test conventions or DOM-free pure component helpers if no browser test runner is configured.

- [ ] **Step 2: Implement operations API client.**

Use the existing `frontend/src/lib/api.js` Axios instance so authentication headers and base URL behavior remain unchanged. Add typed-by-convention methods for trusts, dashboard, donations, approvals, funds, invoices, payroll, and automation without introducing a second HTTP client.

- [ ] **Step 3: Implement shared operations UI.**

Use the existing Tailwind classes, modal patterns, table styles, toast behavior, and loading states. Add accessible labels, visible keyboard focus, empty states with a next action, and reduced-motion-safe behavior.

- [ ] **Step 4: Implement dashboard, approvals, and automation pages.**

Operations dashboard shows credits, debits, balance, donations, funds, pending approvals, payroll status, unpaid invoices, failed deliveries, and recent audit events. Approvals show record type, trust, amount, creator, date, fund, supporting document, and history. Automation shows event status, attempts, last error, and retry action.

- [ ] **Step 5: Register additive routes.**

Lazy-load the new pages in `App.jsx` and add only the `/operations/*` routes. Wrap each route with existing `Protected` behavior plus the operations feature guard. Leave all existing routes unchanged.

- [ ] **Step 6: Add navigation group.**

Add Operations entries only when their flags are enabled and preserve the existing saved navigation order behavior. Keep the existing General Ledger target unchanged in this task; route compatibility fixes are handled separately only if a baseline test demonstrates a regression.

- [ ] **Step 7: Run frontend checks.**

Run:

```bash
npm --prefix frontend test
npm --prefix frontend run lint
npm --prefix frontend run build
```

- [ ] **Step 8: Commit.**

```bash
git add frontend/src/pages/operations frontend/src/components/operations frontend/src/lib/operationsApi.js frontend/src/App.jsx frontend/src/components/Nav.jsx
git commit -m "feat: add operations dashboard"
```

## Task 11: Add consolidated reports and audit/delivery monitoring

**Files:**
- Create: `backend/src/routes/operationsReports.js`
- Create: `backend/src/routes/operationsAudit.js`
- Create: `backend/test/operationsReports.test.js`
- Create: `backend/test/operationsAudit.test.js`
- Create: `frontend/src/pages/operations/OperationsReports.jsx`
- Create: `frontend/src/pages/operations/OperationsAudit.jsx`
- Modify: `backend/src/server.js`
- Modify: `frontend/src/pages/operations/OperationsDashboard.jsx`

**Interfaces:**
- `getOperationsReport({ trustId, from, to, fundId, type, status })` returns rows carrying `trust_id` and aggregated totals.
- `getConsolidatedOperationsReport({ from, to, filters })` returns trust-separated groups and a total only for authorized roles.
- `getOperationsAudit({ trustId, entityType, entityId, actorId })` returns append-only audit events.
- `getDeliveryHealth({ trustId, status, from, to })` returns counts, last errors, and retryable events.

- [ ] **Step 1: Write report isolation tests.**

Create fixtures for all three trusts and assert a per-trust query never includes another trust. Assert consolidated output retains trust labels and does not double-count a donation, invoice, payroll run, or reversal.

- [ ] **Step 2: Implement report queries.**

Use parameterized Supabase filters or SQL views over posted operations journals and allocations. Add indexes for trust/date/status filters. Never construct SQL by string concatenating user-provided trust IDs, dates, or statuses.

- [ ] **Step 3: Implement audit and delivery monitoring APIs.**

Expose read-only monitoring to Admin and Accountant and read-only audit access to Viewer. Retry actions remain Admin/Accountant only and call the idempotent delivery service.

- [ ] **Step 4: Add report and audit pages.**

Support trust, All trusts, date range, financial year, fund, payment mode, donation purpose, payroll period, and invoice status filters. Show trust identity on every consolidated row.

- [ ] **Step 5: Run report checks.**

Run:

```bash
npm --prefix backend test -- --test-name-pattern="operations report|operations audit"
npm --prefix frontend run build
```

- [ ] **Step 6: Commit.**

```bash
git add backend/src/routes/operationsReports.js backend/src/routes/operationsAudit.js backend/test/operationsReports.test.js backend/test/operationsAudit.test.js backend/src/server.js frontend/src/pages/operations
git commit -m "feat: add operations reporting"
```

## Task 12: Complete compatibility, rollout documentation, and final verification

**Files:**
- Create: `docs/operations-rollout.md`
- Create: `docs/operations-test-matrix.md`
- Create: `.github/workflows/operations-checks.yml`
- Modify: `README.md`
- Modify: `.env.example` files only with non-secret names and comments
- Test: `backend/test/operationsCompatibility.test.js`

**Interfaces:**
- `docs/operations-rollout.md` documents disabled-by-default deployment, trust setup, feature-flag order, test mode, rollback, and delivery monitoring.
- `docs/operations-test-matrix.md` maps acceptance criteria to actual commands and tests.
- CI runs offline checks without requiring Supabase, payment, SMTP, WhatsApp, Telegram, or Google credentials.

- [ ] **Step 1: Write compatibility tests.**

Assert that:

- Existing route mount strings remain present.
- Existing migration files remain present.
- Existing frontend test files remain present.
- Operations flags default to disabled.
- Existing webhook success payload keys remain present.
- No operations migration contains destructive DDL.

- [ ] **Step 2: Document safe deployment.**

Write the exact sequence:

```text
schema with flags disabled → existing checks → deploy API/frontend → verify login/routes/webhook → enable trust read-only → enable approvals → test donation documents → enable funds/invoices/payroll → monitor delivery and audit
```

Document that trust legal values, branding, payment configuration, sender email, and statutory payroll rules are supplied through deployment secrets/configuration, not source code.

- [ ] **Step 3: Add CI checks.**

Run root `npm test`, `npm run lint`, and `npm run build` on a clean checkout with no private credentials. Do not add a fake success command for unavailable external services; mark those checks as integration-only and document the required authorized environment.

- [ ] **Step 4: Run the full local verification.**

Run:

```bash
npm ci
npm test
npm run lint
npm run build
git diff --check
git status --short
```

Expected: every configured offline check passes, `git diff --check` is clean, and only intended files are modified.

- [ ] **Step 5: Review the acceptance criteria.**

Verify each design acceptance criterion against a test name or command in `docs/operations-test-matrix.md`. Any criterion without executed evidence remains open and must not be reported as complete.

- [ ] **Step 6: Commit.**

```bash
git add docs/operations-rollout.md docs/operations-test-matrix.md .github/workflows/operations-checks.yml README.md backend/test/operationsCompatibility.test.js
git commit -m "docs: document operations rollout and checks"
```

## Execution order and checkpoints

Implement tasks in this order:

```text
1 baseline
2 schema
3 flags/auth
4 posting/approvals
5 donations
6 documents/email
7 funds
8 invoices
9 payroll
10 frontend
11 reports/monitoring
12 rollout/verification
```

After each task:

1. Run the task-specific tests.
2. Run the smallest relevant existing CRM check.
3. Inspect `git diff` and `git status`.
4. Commit only the task's intended files.
5. Do not enable a feature flag globally until its task and compatibility checks pass.

## Plan self-review

### Spec coverage

- Additive-only compatibility: Tasks 1, 2, 3, 5, and 12.
- Three trusts and shared people: Tasks 2 and 3.
- Three global roles: Task 3.
- Mandatory approval and Admin posting: Task 4.
- Verified online donation exception: Task 5.
- Immediate combined receipt/invoice email: Task 6.
- Idempotency and retry: Tasks 5 and 6.
- Fund management: Task 7.
- Invoice lifecycle: Task 8.
- Payroll and Indian fields: Task 9.
- Operations UI and feature flags: Tasks 3 and 10.
- Consolidated reporting and audit: Task 11.
- Deployment, rollback, reproducibility, and checks: Tasks 1 and 12.

### Completeness scan

Every task has concrete files, interfaces, test steps, commands, and a commit boundary. Environment-specific trust names, legal identifiers, branding, payment configuration, sender email, and statutory payroll rules are explicitly configuration inputs from the approved design rather than source-code assumptions.

### Type and interface consistency

- Task 3 defines `can`, feature flags, and trust context used by Tasks 4, 5, 7, 8, 9, and 10.
- Task 4 defines the posting and approval services used by donation, fund, invoice, and payroll tasks.
- Task 5 defines donation/payment event IDs used by Task 6.
- Task 6 defines document and delivery functions used by the dashboard and monitoring tasks.
- Task 7, Task 8, and Task 9 all use the same trust, fund, approval, and posting boundaries.
- Task 10 consumes the API routes introduced by Tasks 3–9 without changing existing routes.
