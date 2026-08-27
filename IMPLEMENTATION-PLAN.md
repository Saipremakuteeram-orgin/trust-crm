# Trust CRM — Implementation Plan

## Current Stable State
- **Latest working commit:** `960e36a`
- **Rollback:** `git reset --hard 68922d3 && git push --force`

---

## Phase 1: Chart of Accounts + Double Entry Journal
**Priority:** Highest  
**Status:** Not Started  
**Commit:** `0000000`

### 1.1 Database Schema
- [ ] Create `chart_of_accounts` table (account_code, name, type, parent_id, is_active)
- [ ] Create `journal_entries` table (entry_number, date, description, is_posted)
- [ ] Create `journal_entry_lines` table (journal_entry_id, account_id, debit, credit, description)
- [ ] Create `account_balances` view (running balance per account)
- [ ] Add RLS policies for accountant/admin access

### 1.2 Backend Routes
- [ ] `GET /api/accounts` — list chart of accounts
- [ ] `POST /api/accounts` — create account (admin)
- [ ] `PATCH /api/accounts/:id` — update account (admin)
- [ ] `DELETE /api/accounts/:id` — delete account (admin)
- [ ] `GET /api/journal-entries` — list journal entries
- [ ] `POST /api/journal-entries` — create journal entry (admin/accountant)
- [ ] `PATCH /api/journal-entries/:id` — update draft entry
- [ ] `POST /api/journal-entries/:id/post` — post entry (admin)
- [ ] `DELETE /api/journal-entries/:id` — delete draft entry
- [ ] `GET /api/trial-balance` — trial balance report

### 1.3 Frontend Pages
- [ ] `/accounts` — Chart of Accounts management (admin only)
  - [ ] Tree view with parent/child accounts
  - [ ] Add/Edit/Delete accounts
  - [ ] Account types: Assets, Liabilities, Equity, Income, Expenses
- [ ] `/journal` — Journal Entry form
  - [ ] Header: date, description, reference
  - [ ] Lines: account selector, debit, credit
  - [ ] Auto-balance validation
  - [ ] Post/Draft/Save actions
- [ ] `/trial-balance` — Trial Balance report
  - [ ] Debit/Credit columns
  - [ ] Export to Excel/PDF

### 1.4 Integration
- [ ] Update transaction creation to also create journal entry lines
- [ ] Link transactions to journal entries
- [ ] Update dashboard to show ledger-based balances

---

## Phase 2: General Ledger + Trial Balance
**Priority:** High  
**Status:** Not Started  
**Commit:** `0000000`

### 2.1 Backend Routes
- [ ] `GET /api/accounts/:id/ledger` — account ledger with running balance
- [ ] `GET /api/reports/balance-sheet` — Balance Sheet
- [ ] `GET /api/reports/profit-loss` — Profit & Loss
- [ ] `GET /api/reports/cash-flow` — Cash Flow Statement

### 2.2 Frontend Pages
- [ ] `/ledger/:accountId` — General Ledger view
  - [ ] Filter by date range
  - [ ] Running balance column
  - [ ] Export to Excel/PDF
- [ ] `/reports` — Enhanced Reports page
  - [ ] Balance Sheet tab
  - [ ] P&L tab
  - [ ] Cash Flow tab

---

## Phase 3: Trustees/Beneficiaries Registry
**Priority:** Medium  
**Status:** Not Started  
**Commit:** `0000000`

### 3.1 Database Schema
- [ ] Create `trustees` table (contact_id, appointment_date, term_end, role, is_active)
- [ ] Create `beneficiaries` table (contact_id, eligibility_start, eligibility_end, category, notes)
- [ ] Create `beneficiary_disbursements` table (beneficiary_id, amount, date, purpose, receipt_file_id)

### 3.2 Backend Routes
- [ ] `GET /api/trustees` — list trustees
- [ ] `POST /api/trustees` — add trustee (admin)
- [ ] `PATCH /api/trustees/:id` — update trustee
- [ ] `DELETE /api/trustees/:id` — remove trustee
- [ ] `GET /api/beneficiaries` — list beneficiaries
- [ ] `POST /api/beneficiaries` — add beneficiary (admin/accountant)
- [ ] `PATCH /api/beneficiaries/:id` — update beneficiary
- [ ] `DELETE /api/beneficiaries/:id` — remove beneficiary
- [ ] `GET /api/beneficiaries/:id/disbursements` — beneficiary disbursement history
- [ ] `POST /api/beneficiaries/:id/disburse` — record disbursement

### 3.3 Frontend Pages
- [ ] `/trustees` — Trustees management (admin)
  - [ ] List with appointment dates, terms, roles
  - [ ] Add/Edit/Remove trustees
  - [ ] Active/Inactive status
- [ ] `/beneficiaries` — Beneficiaries registry
  - [ ] List with eligibility dates, categories
  - [ ] Add/Edit beneficiaries
  - [ ] Record disbursements
  - [ ] Disbursement history per beneficiary

---

## Phase 4: Compliance Calendar + Reports
**Priority:** Medium  
**Status:** Not Started  
**Commit:** `0000000`

### 4.1 Database Schema
- [ ] Create `compliance_items` table (name, frequency, due_date, responsible_person, status, notes)
- [ ] Create `compliance_returns` table (compliance_item_id, period, due_date, filed_date, status, acknowledgement_number, file_url)

### 4.2 Backend Routes
- [ ] `GET /api/compliance` — list compliance items
- [ ] `POST /api/compliance` — add compliance item (admin)
- [ ] `PATCH /api/compliance/:id` — update compliance item
- [ ] `DELETE /api/compliance/:id` — delete compliance item
- [ ] `GET /api/compliance/:id/returns` — list returns
- [ ] `POST /api/compliance/:id/returns` — file return
- [ ] `PATCH /api/compliance/:id/returns/:returnId` — update return

### 4.3 Frontend Pages
- [ ] `/compliance` — Compliance dashboard
  - [ ] Calendar view of due dates
  - [ ] Status tracking (pending, filed, overdue)
  - [ ] Add/Edit compliance items
  - [ ] File returns with upload
  - [ ] Filter by type (FCRA, 12A, 80G, IT, Charity Commissioner)

---

## Phase 5: Donation Receipts with Certificates
**Priority:** Medium  
**Status:** Not Started  
**Commit:** `0000000`

### 5.1 Database Schema
- [ ] Create `donation_receipts` table (receipt_number, transaction_id, donor_id, amount, date, section_80g, section_12a, acknowledgement_number, notes)
- [ ] Add receipt_number generation function

### 5.2 Backend Routes
- [ ] `GET /api/receipts` — list donation receipts
- [ ] `POST /api/receipts` — generate receipt from transaction
- [ ] `GET /api/receipts/:id/pdf` — download receipt PDF
- [ ] `PATCH /api/receipts/:id` — update receipt
- [ ] `DELETE /api/receipts/:id` — void receipt

### 5.3 Frontend Pages
- [ ] `/receipts` — Donation receipts management
  - [ ] List with search/filter
  - [ ] Generate receipt from transaction
  - [ ] Auto-numbering
  - [ ] PDF generation with trust letterhead
  - [ ] Section 80G/12A certificates

---

## Phase 6: Bank Reconciliation
**Priority:** Low  
**Status:** Not Started  
**Commit:** `0000000`

### 6.1 Database Schema
- [ ] Create `bank_statements` table (uploaded_file_id, bank_name, account_number, period_start, period_end, uploaded_by)
- [ ] Create `bank_reconciliations` table (statement_id, transaction_id, status, notes)

### 6.2 Backend Routes
- [ ] `GET /api/bank-reconciliation` — list pending matches
- [ ] `POST /api/bank-reconciliation/match` — match bank entry to transaction
- [ ] `POST /api/bank-reconciliation/import` — import bank statement Excel/CSV

### 6.3 Frontend Pages
- [ ] `/bank-reconciliation` — Bank reconciliation page
  - [ ] Upload bank statement
  - [ ] Unmatched transactions list
  - [ ] Match/unmatch actions
  - [ ] Reconciliation summary

---

## Implementation Rules
1. Each phase is implemented in a separate commit
2. Each phase can be rolled back independently
3. No phase proceeds without user approval
4. User can skip any phase at any time
