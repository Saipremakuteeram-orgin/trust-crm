# Findings — Task 11 Operations reports, audit, and delivery monitoring

## Existing contracts

- `operations_*` schema is additive and trust-scoped. Posted accounting facts live in `operations_transactions`, `operations_journal_entries`, and `operations_journal_lines`; fund rows live in `operations_fund_allocations` and `operations_donation_allocations`.
- Source entities carry report filters needed by the task: donations have `payment_mode` and `purpose`; invoices have `status`; payroll has `payroll_period_id`; transactions/journals have posted dates and status; fund allocations have `fund_id` and status.
- `operations_audit_events` is append-only by API contract and has `trust_id`, entity/action, actor, request metadata, reason, and timestamp.
- Delivery monitoring uses `operations_automation_events` for event processing state and `operations_document_deliveries` for recipient delivery state. Existing `processAutomationBatch` and `deliverDonationDocuments` are injectable and idempotent.
- `operationsAuth` already supplies feature-gated auth, role checks, concrete/all-trust scope resolution, and active-trust validation. Read boundaries are Admin/Accountant/Viewer; retries must be Admin/Accountant.
- `operationsApi.js` already calls `/v2/operations/automation/events` and its retry endpoint. No backend route currently serves those paths, so the new audit route module will export an automation router factory as well as the audit router.
- `OperationsLayout`, `TrustSelector`, and `StatusBadge` provide the established responsive shell and status vocabulary. `OperationsDashboard` already displays delivery/audit summary data and needs report/delivery-health integration rather than a replacement.

## Implementation decisions

- Report repository methods will accept normalized filters and use Supabase query-builder methods (`eq`, `gte`, `lte`, `in`, `order`) rather than interpolated SQL.
- Consolidated rows will be source-record based and preserve `trust_id`/trust label on every row; posted journals are used for posted debit/credit totals, while source entities provide purpose/payment/status dimensions.
- A memory repository in focused tests will exercise all three trust scopes, source grouping, reversal exclusion/deduplication, append-only audit reads, delivery counts, and retry authorization.

## Review findings confirmed in current code

- `operationsReports.js` only loads/iterates posted journal entries and then rejects any linked transaction whose status is not `posted`; this drops an original transaction when its transaction status is `reversed`. Its journal-level deduplication must remain intact while allowing the original posted journal plus the posted reversal journal.
- `financialYearFor` in `operationsReports.js` is hardcoded to April and the report trust projection currently selects no configured start month. `documentDeliveryService.js` already uses a configured trust month for document numbering and is a separate behavior to preserve.
- `operationsAudit.js` applies display `limit` before delivery-health counts, combines document deliveries and automation events as independent records, and does not include `attemptCount` in the successful retry patch when the service returns a retrying state.
- Supabase delivery-health repository queries also apply the display limit to both source collections; summary counts therefore need an unbounded filtered load or a separate count path, with detail slicing performed after correlation.
- `OperationsAudit.jsx` and its frontend test are present under the project root; the earlier absolute reads omitted the project directory because of its spaces. Correct paths are used below.
- The existing frontend test runner is Node's built-in test runner and does not render JSX. A pure retry-eligibility helper in `operationsApi.js` can cover the All-trust boundary without adding a frontend test dependency.
- Automation worker retries already persist `attemptCount`; the manual retry path in `operationsAudit.js` increments only on thrown delivery errors and omits it from the successful retrying patch.
- `OperationsAudit.jsx` currently derives retry visibility from role/status only, so its selected trust context is not part of the guard.
- Migration 016 confirms `operations_trusts.financial_year_start_month` is the source of truth. Migration 019 confirms reversal semantics: the original transaction becomes `reversed`, its posted journal remains immutable, and a separate posted reversal transaction/journal is inserted.
- The delivery schema links document deliveries to receipts/invoices while automation events identify donations via `aggregate_id`; correlation can resolve a document delivery's donation through repository-provided `donation_id`/`aggregate_id` fields or joined fixture data, with a conservative stable identity fallback for paired rows.
