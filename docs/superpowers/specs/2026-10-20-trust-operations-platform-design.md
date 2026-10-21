# Trust Operations Platform — Additive Feature Design

**Status:** Approved for implementation planning
**Date:** 2026-10-20
**Repository:** `Saipremakuteeram-orgin/trust-crm`
**Baseline commit:** `ce56a04`

## 1. Summary

The existing Trust CRM will be extended with additive modules for three-trust operations. The current CRM remains available and is not replaced, overwritten, or destructively migrated.

The new platform will provide:

- Shared access to all three trusts.
- Three global roles: Admin, Accountant, and Viewer.
- Trust-scoped debit and credit management.
- Donation capture, fund allocation, receipt generation, and invoice generation.
- Immediate email delivery of one donation receipt PDF and one invoice PDF after verified online payment.
- Mandatory approval for manually entered financial records.
- Fund management for restricted, unrestricted, designated, and program funds.
- Payroll management with Indian payroll fields.
- Audit history, delivery tracking, and retryable automation.
- Trust-level and consolidated reporting.

The implementation will preserve the current React/Vite, Express, Supabase/PostgreSQL, Vercel, and Render stack.

## 2. Evidence and scope boundary

This design is informed by:

- The public CRM product workflow at `https://www.zoho.com/en-us/crm/`.
- The current public Trust CRM at `https://crmsaidharmasamrakshanapremakuteeram.dpdns.org/`.
- The public repository at `https://github.com/Saipremakuteeram-orgin/trust-crm.git`.
- Static repository analysis with REA evidence ID `ev_b5f905dd7daf68bfd412b73d40d2fddb58d6f239f6a18ff277bde16bc0c0e554`.
- Focused donation, receipt, and transaction analysis with REA evidence ID `ev_fee43530281ca7a14fae85d1aff5506bfbb0106461148c85aa09b05ad84ec82e`.

REA established static observations about the supplied JavaScript and repository. It did not establish private Zoho implementation details or authenticated behavior in the live Trust CRM. The live site was inspected without credentials; only the login screen and unauthenticated route behavior were verified.

Observed baseline capabilities include a credit/debit ledger, cash/digital modes, contacts, recurring transactions, functions and budgets, chart of accounts, journal entries, receipts, bank reconciliation, OCR expense capture, reports, and notification integrations. Observed gaps include the lack of a trust dimension, a payroll module, a proper invoice module, a restricted-fund model, and a reliable donation-to-document delivery flow.

## 3. Product goals

### 3.1 Goals

1. Add three-trust operations without breaking the existing CRM.
2. Keep every new financial fact attributable to one trust.
3. Make the three roles usable across all three trusts.
4. Require Admin approval before manually entered financial records become official.
5. Auto-post verified online donations without waiting for manual approval.
6. Generate and email both the receipt and invoice immediately after verified payment.
7. Prevent duplicate donations, documents, numbers, and successful deliveries.
8. Keep accounting, fund balances, payroll, and invoices auditable.
9. Support Indian defaults: INR, Asia/Kolkata, April–March financial year, PAN, 80G, 12A, TDS, PF, ESI, and professional-tax fields.
10. Allow phased rollout through feature flags.

### 3.2 Non-goals

This design does not replace the existing CRM, redesign its current pages, or rewrite historical records in the first release. It does not claim legal or tax compliance by itself; statutory rules must be validated by the Trust's accountant and advisors. It does not introduce a new framework, new payment provider, or new email provider unless a later approved decision requires one.

## 4. Compatibility principles

The following are hard compatibility constraints:

- No existing table is dropped.
- No existing column is removed or repurposed.
- No existing route is renamed or removed.
- No existing record is deleted by the new modules.
- Existing manual receipt behavior remains available.
- Existing payment webhook behavior remains compatible.
- New automation is disabled by default until verified.
- New tables use an additive `operations_` namespace or equivalent unique names.
- New records may reference existing records, but existing records are not rewritten to carry new required fields.
- Rollback means disabling new feature flags or reverting new application code; new tables and records remain available for investigation.

The existing CRM remains usable when every new feature flag is disabled.

## 5. Users and authorization

There are exactly three global roles. All roles can access all three trusts; the role controls the permitted action.

### 5.1 Admin

Admin has full access across all trusts:

- Manage users, roles, trust settings, and integrations.
- Create, edit, approve, post, reverse, and correct financial records.
- Manage donors, contacts, donations, receipts, invoices, funds, budgets, payroll, reports, and reconciliation.
- Manage automation settings, delivery retries, backups, and audit access.
- View trust-level and consolidated reports.

### 5.2 Accountant

Accountant has operational finance access across all trusts:

- Manage contacts, donors, donations, debit and credit entries, funds, invoices, receipts, payroll, reports, journals, and reconciliation.
- Create and submit manual records for approval.
- Prepare payroll and fund transfers.
- Retry failed document delivery.
- Export permitted financial reports.

Accountant cannot manage users, security settings, or integrations and cannot approve their own submitted records.

### 5.3 Viewer

Viewer has read-only access across all trusts:

- View dashboards, donations, expenses, invoices, receipts, payroll summaries, funds, journals, reports, and audit history.
- Export reports that are marked exportable.

Viewer cannot create, edit, approve, post, delete, reverse, or retry financial operations.

### 5.4 Server-side enforcement

The frontend trust selector is a view filter, not an authorization boundary. Every protected API operation validates:

```text
authenticated user → global role → selected trust → requested action
```

The Express authorization middleware is the first enforcement layer. Supabase RLS is the database enforcement layer. The service-role key remains backend-only.

## 6. Architecture

```text
React/Vite existing CRM
  ├── existing routes and pages
  └── optional Operations routes
        ↓
Supabase Auth
        ↓
Express API
  ├── existing route surface
  └── /api/v2/operations/* additive route surface
        ↓
Authorization and validation
        ↓
Operations domain services
  ├── posting service
  ├── donation service
  ├── fund service
  ├── invoice/receipt service
  ├── payroll service
  └── automation/outbox service
        ↓
Supabase/PostgreSQL
  ├── existing schema, unchanged
  └── operations_* additive schema
        ↓
Email and existing payment integrations
```

New routes will be versioned and separated from existing routers:

```text
/api/v2/operations/trusts
/api/v2/operations/donations
/api/v2/operations/approvals
/api/v2/operations/funds
/api/v2/operations/invoices
/api/v2/operations/payroll
/api/v2/operations/automation
```

The existing route paths continue to serve existing screens. The new modules will not depend on undocumented frontend behavior from the existing pages.

## 7. Trust and shared-person model

### 7.1 Trust records

The new schema will add a trust entity containing:

- Name and legal name.
- Registration and legal identifiers.
- Address and contact information.
- Logo and document branding settings.
- Default currency and timezone.
- Financial-year configuration.
- Receipt and invoice numbering configuration.
- 80G/12A and PAN presentation settings.
- Active/inactive status.

The first release will seed three configured trust records through an Admin-only setup flow. Their final names and legal values will be supplied during implementation configuration rather than hard-coded.

### 7.2 Shared people

People are globally reusable:

```text
operations_people
operations_trust_people
```

`operations_people` stores identity fields such as name, email, phone, PAN, and address. `operations_trust_people` stores the relationship to a trust, such as donor, beneficiary, vendor, employee, trustee, volunteer, or contact, along with trust-specific notes and communication preferences.

A donor who supports more than one trust is one shared person with separate trust-specific donation and receipt history.

## 8. Feature flags

The new modules are independently enabled:

```text
ENABLE_OPERATIONS_TRUSTS
ENABLE_OPERATIONS_DONATIONS_AUTOMATION
ENABLE_OPERATIONS_APPROVALS
ENABLE_OPERATIONS_FUNDS
ENABLE_OPERATIONS_INVOICES
ENABLE_OPERATIONS_PAYROLL
ENABLE_OPERATIONS_AUTOMATION_MONITOR
```

Flags are evaluated server-side for API access and client-side for navigation visibility. A disabled flag must not alter existing CRM behavior.

## 9. Additive data model

All new tables will use an additive namespace. The exact SQL types and indexes will be finalized in the implementation plan, following the existing Supabase/PostgreSQL conventions and the database security requirements.

### 9.1 Access and trust tables

```text
operations_trusts
operations_trust_settings
```

The existing global profile role remains compatible with the three-role model. The first release does not add per-trust user memberships because every role can access all three trusts.

### 9.2 CRM relationship tables

```text
operations_people
operations_trust_people
operations_person_preferences
operations_activities
```

Existing contacts remain intact. New people records may be linked to an existing contact through a nullable `legacy_contact_id` stored in the new table. The new schema does not require adding a column to the existing contacts table.

### 9.3 Accounting and approval tables

```text
operations_transactions
operations_journal_entries
operations_journal_lines
operations_approval_requests
operations_approval_actions
operations_audit_events
```

The new transaction is a user-facing business record. The new journal is the official posted accounting representation for new operations records. A new transaction may store a nullable `legacy_transaction_id` pointing to an existing CRM transaction, but the existing transaction is not overwritten.

Every posted new journal must satisfy:

```text
sum(debits) = sum(credits)
```

Posted journals are immutable. Corrections create reversal entries and, where necessary, a new corrected transaction.

### 9.4 Fund tables

```text
operations_funds
operations_fund_budgets
operations_fund_allocations
operations_fund_commitments
operations_fund_transfers
```

Funds support:

- Restricted funds.
- Unrestricted funds.
- Donor-designated funds.
- Program/event funds.
- Opening balance.
- Budget and actual amount.
- Committed amount.
- Available balance.
- Source and destination transfers.

Fund transfers are separate financial events and require Admin approval.

### 9.5 Donation tables

```text
operations_payment_events
operations_donations
operations_donation_allocations
operations_donation_documents
```

`operations_payment_events` is the idempotency boundary. It stores the gateway, payment ID, signature-verification result, received payload hash, processing status, timestamps, and error information. Secrets and raw private payloads are not copied into logs or committed files.

`operations_donations` stores the trust, shared donor, payment event, amount, currency, payment mode, gateway, purpose, status, document references, and optional links to an existing CRM transaction.

### 9.6 Invoice, receipt, and delivery tables

```text
operations_invoices
operations_invoice_lines
operations_receipts
operations_document_deliveries
operations_document_templates
operations_number_sequences
```

Each invoice and receipt is trust-specific and financial-year-specific. A document is immutable after sending. A correction cancels the original and issues a replacement with an audit link.

`operations_document_deliveries` tracks the recipient, channel, document IDs, attempt number, status, provider message ID where available, last error, and next retry time.

### 9.7 Payroll tables

```text
operations_employees
operations_employee_documents
operations_salary_structures
operations_salary_components
operations_payroll_periods
operations_payroll_runs
operations_payroll_lines
operations_payroll_adjustments
operations_payslips
operations_payroll_payments
```

Payroll records carry trust, employee/person, financial year, period, fund, journal, approval, and payment links. Indian payroll fields include TDS, PF, ESI, and professional-tax values where configured.

## 10. Approval model

Approval is mandatory for every manually entered financial record. Approval configuration is optional, but the default rule is still Admin approval.

### 10.1 State machine

```text
Draft
  → Pending approval
  → Approved
  → Posted
```

Alternative paths:

```text
Pending approval → Rejected with reason
Posted → Reversed with reason
```

Only the posting service can move an approved record to Posted. The frontend cannot mark a record posted by changing a status value.

### 10.2 Records requiring approval

Approval is required for:

- Offline donations.
- Manual credits.
- Manual debits and expenses.
- Payroll runs.
- Fund transfers.
- Manually created invoices where the invoice represents a financial obligation.
- Opening-balance adjustments in the new operations module.

Verified online donations are the explicit automatic-posting exception.

### 10.3 Approval action rules

- Admin can approve or reject pending records.
- Accountant can create and submit records but cannot approve their own records.
- Viewer cannot create or approve records.
- Rejection requires a reason.
- Approval and rejection actions are append-only audit events.
- A submitted record cannot be silently edited; edits return it to Draft and preserve the prior submission history.

## 11. Posting service

All new financial modules use one posting service rather than writing independent balances.

```text
Business event
  → validate trust, accounts, fund, amount, and state
  → create operations transaction
  → create balanced journal entry and lines
  → create fund allocation if applicable
  → create audit event
  → enqueue document or notification work
```

The posting operation is atomic from the application perspective. If journal creation or fund allocation fails, the record remains unposted and the failure is visible for retry. Official reports use posted new journals for the new operations modules.

The existing CRM ledger and reports continue to function independently. Cross-linking is explicit and does not cause the new service to mutate old records.

## 12. Donation workflow and automatic documents

### 12.1 Verified online donation

```text
Payment gateway confirms payment
  → verify webhook signature and amount
  → check operations_payment_events idempotency key
  → create or match shared person
  → create operations donation
  → create posted credit transaction
  → create balanced journal entry
  → allocate donation to trust and fund
  → link existing CRM transaction when present
  → enqueue receipt and invoice generation
  → attempt email immediately
  → store delivery result
```

The existing payment webhook contract remains available. With donation automation disabled, it behaves as before. With automation enabled, the existing transaction is still created as before and the additive operations workflow is attached through a feature-flagged, non-blocking event path.

The payment gateway remains authoritative for verified online payments. A webhook retry resumes the existing event rather than creating another donation.

### 12.2 Offline donation

```text
Accountant records donation
  → Draft
  → Pending approval
  → Admin approves
  → posted credit and journal
  → receipt and invoice generated
  → one email sent when donor email is valid
```

### 12.3 Receipt and invoice email

One email contains both attachments:

```text
Donation receipt PDF
Donation invoice PDF
```

Documents include trust branding, legal details, donor information, amount, date, payment mode, purpose or fund, receipt number, invoice number, and PAN/80G/12A fields where applicable.

Document generation and email delivery are retryable. A failure does not undo a posted donation or cause the payment gateway to be charged again.

### 12.4 Numbering

Receipt and invoice numbers use a database-backed atomic allocator keyed by:

```text
trust_id + document_type + financial_year
```

The implementation must not use `MAX(number) + 1`. Concurrent payments must receive unique numbers.

## 13. Expense and debit workflow

```text
Accountant enters or scans expense
  → attach supporting document
  → select trust, account, category, and fund
  → Draft
  → Pending approval
  → Admin approves
  → debit transaction posts
  → balanced journal created
  → fund balance and reports update
```

OCR is an input assistant only. Extracted values remain unposted until the normal approval flow completes.

The new operations workflow does not remove or change the existing transaction/OCR workflow.

## 14. Fund workflow

Donations increase a fund's available balance through an allocation. Approved eligible expenses decrease it. A fund transfer decreases the source and increases the destination in one approved accounting event.

The system validates:

- Fund belongs to the selected trust.
- Allocation amount is positive.
- Expense is eligible for the fund.
- Available balance is sufficient unless an Admin records an override reason.
- Transfer source and destination are different funds in the same trust unless cross-trust transfers are explicitly enabled later.

## 15. Payroll workflow

```text
Accountant prepares payroll period
  → calculate salary components and adjustments
  → calculate configured deductions
  → validate employee and fund data
  → submit payroll run
  → Admin approves
  → generate payslips
  → post payroll debit and journal
  → record payment status
```

Payroll uses INR, Asia/Kolkata, and the April–March financial year by default. TDS, PF, ESI, and professional-tax fields are stored and configurable; legal calculation rules require verification before production use.

## 16. Invoice lifecycle

```text
Draft
  → Approved
  → Sent
  → Partially paid
  → Paid
  → Overdue
  → Cancelled
```

Invoices have trust-specific sequences, customer/donor/vendor details, line items, due dates, payment status, PDF artifacts, delivery history, and accounting links. A sent invoice is not edited in place; cancellation and reissue preserve the audit chain.

## 17. User experience

The existing application layout, authentication, navigation patterns, tables, modals, toasts, responsive behavior, colors, and typography remain the visual baseline.

### 17.1 Existing routes

The existing routes remain available, including:

```text
/dashboard
/transactions
/contacts
/reports
/receipts
/functions
/accounts
/journal
/trial-balance
/ledger/:accountId
```

No current route is replaced by an operations route.

### 17.2 Additive routes

New pages are grouped under Operations:

```text
/operations
/operations/donations
/operations/approvals
/operations/funds
/operations/invoices
/operations/payroll
/operations/automation
/operations/trusts
```

The new navigation group is visible only when the relevant feature flag is enabled. The Operations dashboard contains a trust selector with Trust A, Trust B, Trust C, and All Trusts.

### 17.3 Operations dashboard

The dashboard shows:

- Credits, debits, and current balance.
- Donation totals.
- Fund balances and budget-versus-actual values.
- Pending approvals.
- Payroll status.
- Unpaid and overdue invoices.
- Failed or retrying email deliveries.
- Recent audit activity.

The existing dashboard is not modified by the first operations release.

### 17.4 Donation and document screens

The donation screen supports shared-donor search, trust and fund selection, payment reference, status, receipt status, invoice status, and delivery status.

The document screen shows:

```text
Receipt PDF: generated
Invoice PDF: generated
Email: sent / retrying / failed
```

### 17.5 Approval screen

The approval queue shows record type, trust, amount, creator, date, fund, supporting document, and approval history. Admin can approve or reject with a reason. The Accountant can prepare and submit but cannot approve their own record.

### 17.6 Funds, payroll, and invoices

Funds show opening, received, spent, committed, available, and budget-versus-actual values. Payroll shows employees, salary structures, periods, draft and pending runs, payslips, deductions, and payment status. Invoices show Draft, Approved, Sent, Partially paid, Paid, Overdue, and Cancelled states.

## 18. Reliability and failure handling

### 18.1 Outbox events

Automation uses an additive outbox/event table:

```text
operations_automation_events
```

Events record event type, aggregate ID, trust, attempts, state, next attempt time, and non-sensitive error information.

The minimum states are:

```text
pending
processing
completed
failed
retrying
```

### 18.2 Payment processing

The existing webhook response must not depend on the new PDF or email provider. If the additive automation path fails, the old transaction response remains successful and the operations event is retried separately.

### 18.3 Document failures

If PDF generation fails, the donation remains posted and the failure is visible. Retrying reuses the donation, receipt, and invoice identities rather than creating duplicates.

### 18.4 Email failures

Email failures preserve the payment, donation, journals, and generated documents. Temporary provider errors retry with bounded backoff. Invalid recipient addresses are marked as permanent failures until corrected by an Admin or Accountant.

### 18.5 Secrets and privacy

Payment secrets, SMTP credentials, service-role keys, and private payloads stay in environment configuration or approved secret storage. They are not written to repository files, reports, test fixtures, or error messages. Logs contain identifiers and redacted error summaries only.

## 19. Database and migration strategy

Migrations are additive and run in an explicit order:

```text
1. Create operations tables and constraints.
2. Create indexes and RLS policies.
3. Create atomic number allocation functions.
4. Create posting and approval support functions where needed.
5. Seed three trust configuration records through an Admin-controlled setup.
6. Validate schema and policy checks.
7. Enable feature flags one at a time.
```

The first release does not assign old records to a trust by rewriting them. New records are trust-scoped from creation. Existing transactions and contacts can be linked from new records through nullable legacy IDs. Historical migration into Trust 1, if later required, will be a separate reviewed operation with pre/post counts and balance validation.

The repository will use one documented migration path for the new schema. Existing manual migration files will not be silently deleted; migration documentation will identify which files are legacy and which are authoritative for the operations module.

## 20. Reporting

New reports are scoped by:

- Trust.
- All trusts.
- Financial year.
- Date range.
- Fund.
- Payment mode.
- Donation purpose.
- Payroll period.
- Invoice status.

Consolidated views must preserve trust identity on every row and aggregate only records the requesting role is allowed to see. Existing report pages continue to calculate from the existing schema until a separately approved integration is implemented.

## 21. Testing and verification

### 21.1 Access tests

- Admin can perform every supported operations action.
- Accountant can perform operational finance actions but cannot manage users, settings, or integrations.
- Viewer can read but cannot write, approve, post, reverse, or retry.
- All roles can view all three trusts according to their permissions.
- API requests cannot bypass role enforcement by changing a trust selector value.

### 21.2 Approval tests

- Manual donation, debit, payroll, fund transfer, and invoice records cannot post before Admin approval.
- Rejected records do not affect official balances.
- Accountant cannot approve their own submission.
- Posted entries are immutable.
- Reversal entries preserve the original audit chain.

### 21.3 Accounting and fund tests

- Every posted journal balances.
- Invalid accounts, funds, amounts, and trust references are rejected.
- Donation allocations increase fund balances.
- Approved expenses decrease eligible fund balances.
- Fund transfers update both sides atomically.
- Insufficient funds require an Admin override with a reason.

### 21.4 Donation and delivery tests

- Verified online donations auto-post without manual approval.
- Repeated payment callbacks do not duplicate records.
- Shared donors are reused.
- Receipt and invoice numbers are unique under concurrent processing.
- Both PDFs are generated and attached to one email.
- Delivery failures retry without duplicate documents.
- Invalid donor email is recorded as a permanent delivery failure.

### 21.5 Payroll tests

- Salary components and adjustments are deterministic.
- Payroll cannot post before approval.
- Approved payroll creates payslips and balanced accounting entries.
- Payroll payment status is independent from payroll approval status.

### 21.6 Compatibility tests

- Existing frontend tests still pass.
- Existing frontend lint and build still pass.
- Existing routes remain available.
- Existing webhook responses remain compatible when automation is disabled.
- Existing transactions, contacts, receipts, and reports are not deleted or rewritten.
- The new schema can be installed without requiring a destructive migration.

## 22. Deployment and rollout

The release sequence is:

```text
1. Add new schema with all operations flags disabled.
2. Run existing CRM checks.
3. Deploy new API and frontend routes.
4. Verify that existing login, routes, webhook, and reports are unchanged.
5. Enable Operations and trust read-only views.
6. Enable approvals and manual finance records.
7. Enable donation automation in a controlled test environment.
8. Verify receipt/invoice PDFs and one-email delivery.
9. Enable funds, invoices, payroll, and monitoring in sequence.
10. Review audit and delivery metrics after each enablement.
```

Rollback disables the affected feature flag or reverts the new code. Existing CRM behavior remains the fallback path. New operations records are retained for diagnosis and are not removed during rollback.

## 23. Acceptance criteria

The first complete operations release is accepted when:

1. The existing CRM builds and its existing tests pass.
2. The three new trusts can be configured without changing existing transaction rows.
3. Admin, Accountant, and Viewer permissions are enforced server-side.
4. All roles can access all three trusts according to their role.
5. Manual financial records require Admin approval before posting.
6. Verified online donations auto-post exactly once.
7. A verified online donation creates a donation, credit, journal, and fund allocation.
8. The system generates one receipt PDF and one invoice PDF for the donation.
9. The system emails both PDFs together immediately after payment processing.
10. Email and document failures are retryable and auditable.
11. Payroll and fund operations follow the approval and posting rules.
12. New operations routes can be disabled without breaking existing routes.
13. No destructive migration, record deletion, or existing route replacement occurs.

## 24. Design decisions and remaining implementation inputs

The following decisions are fixed by this design:

- One shared application and database.
- Three trust books with consolidated reporting.
- Shared people across trusts with trust-specific relationships.
- Three global roles: Admin, Accountant, Viewer.
- All roles can access all three trusts; permissions differ by role.
- Approval is mandatory for manually entered financial records.
- Verified online donations auto-post.
- Receipt and invoice are sent together in one email.
- Existing payment and email integrations are preserved and extended additively.
- Indian defaults are used.
- Existing CRM behavior is preserved.

Implementation still requires environment-specific configuration supplied outside the repository, including the final legal names and identifiers of the three trusts, document branding, payment gateway configuration, sender email configuration, and the exact statutory payroll rules approved by the Trust's accountant. These values must be provided through secret/configuration management, not hard-coded source files.
