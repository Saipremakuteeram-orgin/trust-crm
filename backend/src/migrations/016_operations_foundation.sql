-- Additive Operations foundation for trust accounting, funds, documents, and payroll.
-- This migration does not modify any existing CRM table.

CREATE TABLE IF NOT EXISTS operations_trusts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  legal_name TEXT,
  registration_number TEXT,
  pan TEXT,
  section_80g_number TEXT,
  section_12a_number TEXT,
  default_currency TEXT NOT NULL DEFAULT 'INR'
    CHECK (default_currency ~ '^[A-Z]{3}$'),
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  financial_year_start_month SMALLINT NOT NULL DEFAULT 4
    CHECK (financial_year_start_month BETWEEN 1 AND 12),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS operations_trust_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trust_id UUID NOT NULL REFERENCES operations_trusts(id) ON DELETE CASCADE,
  setting_key TEXT NOT NULL,
  setting_value JSONB NOT NULL DEFAULT '{}'::jsonb,
  value_type TEXT NOT NULL DEFAULT 'json'
    CHECK (value_type IN ('text', 'number', 'boolean', 'json')),
  description TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (trust_id, setting_key)
);

CREATE TABLE IF NOT EXISTS operations_people (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  normalized_email TEXT,
  normalized_phone TEXT,
  pan TEXT,
  address JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS operations_trust_people (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trust_id UUID NOT NULL REFERENCES operations_trusts(id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES operations_people(id) ON DELETE RESTRICT,
  relationship_type TEXT NOT NULL
    CHECK (relationship_type IN ('donor', 'vendor', 'beneficiary', 'trustee', 'contact', 'employee', 'other')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (trust_id, person_id, relationship_type)
);

CREATE TABLE IF NOT EXISTS operations_payment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trust_id UUID NOT NULL REFERENCES operations_trusts(id) ON DELETE RESTRICT,
  person_id UUID REFERENCES operations_people(id) ON DELETE SET NULL,
  gateway TEXT NOT NULL,
  payment_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL DEFAULT 'payment',
  status TEXT NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'verified', 'failed', 'completed', 'refunded')),
  amount NUMERIC(19,4) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'INR' CHECK (currency ~ '^[A-Z]{3}$'),
  payload_hash TEXT,
  provider_reference TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (trust_id, gateway, payment_id)
);

CREATE TABLE IF NOT EXISTS operations_funds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trust_id UUID NOT NULL REFERENCES operations_trusts(id) ON DELETE RESTRICT,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  fund_type TEXT NOT NULL DEFAULT 'general'
    CHECK (fund_type IN ('general', 'restricted', 'endowment', 'designated', 'project')),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'closed')),
  currency TEXT NOT NULL DEFAULT 'INR' CHECK (currency ~ '^[A-Z]{3}$'),
  opening_balance NUMERIC(19,4) NOT NULL DEFAULT 0 CHECK (opening_balance >= 0),
  description TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (trust_id, code)
);

CREATE TABLE IF NOT EXISTS operations_fund_budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trust_id UUID NOT NULL REFERENCES operations_trusts(id) ON DELETE RESTRICT,
  fund_id UUID NOT NULL REFERENCES operations_funds(id) ON DELETE RESTRICT,
  financial_year TEXT NOT NULL,
  amount NUMERIC(19,4) NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'INR' CHECK (currency ~ '^[A-Z]{3}$'),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'approved', 'closed')),
  notes TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (trust_id, fund_id, financial_year)
);

CREATE TABLE IF NOT EXISTS operations_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trust_id UUID NOT NULL REFERENCES operations_trusts(id) ON DELETE RESTRICT,
  person_id UUID REFERENCES operations_people(id) ON DELETE SET NULL,
  fund_id UUID REFERENCES operations_funds(id) ON DELETE SET NULL,
  payment_event_id UUID REFERENCES operations_payment_events(id) ON DELETE SET NULL,
  transaction_number TEXT,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('debit', 'credit')),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending_approval', 'approved', 'posted', 'rejected', 'reversed', 'cancelled')),
  amount NUMERIC(19,4) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'INR' CHECK (currency ~ '^[A-Z]{3}$'),
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT,
  source_type TEXT,
  source_id UUID,
  approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  posted_at TIMESTAMPTZ,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS operations_journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trust_id UUID NOT NULL REFERENCES operations_trusts(id) ON DELETE RESTRICT,
  transaction_id UUID REFERENCES operations_transactions(id) ON DELETE SET NULL,
  entry_number TEXT NOT NULL,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT NOT NULL,
  reference TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending_approval', 'posted', 'reversed', 'cancelled')),
  currency TEXT NOT NULL DEFAULT 'INR' CHECK (currency ~ '^[A-Z]{3}$'),
  total_debit NUMERIC(19,4) NOT NULL DEFAULT 0 CHECK (total_debit >= 0),
  total_credit NUMERIC(19,4) NOT NULL DEFAULT 0 CHECK (total_credit >= 0),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  posted_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  posted_at TIMESTAMPTZ,
  reversed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reversed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (trust_id, entry_number),
  CHECK (status <> 'posted' OR total_debit = total_credit)
);

CREATE TABLE IF NOT EXISTS operations_journal_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trust_id UUID NOT NULL REFERENCES operations_trusts(id) ON DELETE RESTRICT,
  journal_entry_id UUID NOT NULL REFERENCES operations_journal_entries(id) ON DELETE RESTRICT,
  line_number INTEGER NOT NULL CHECK (line_number > 0),
  account_code TEXT NOT NULL,
  description TEXT,
  debit NUMERIC(19,4) NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit NUMERIC(19,4) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  currency TEXT NOT NULL DEFAULT 'INR' CHECK (currency ~ '^[A-Z]{3}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (trust_id, journal_entry_id, line_number),
  CHECK ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0))
);

CREATE TABLE IF NOT EXISTS operations_approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trust_id UUID NOT NULL REFERENCES operations_trusts(id) ON DELETE RESTRICT,
  record_type TEXT NOT NULL,
  record_id UUID NOT NULL,
  transaction_id UUID REFERENCES operations_transactions(id) ON DELETE SET NULL,
  journal_entry_id UUID REFERENCES operations_journal_entries(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending_approval'
    CHECK (status IN ('pending_approval', 'approved', 'rejected', 'cancelled')),
  requested_by UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  reviewed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reason TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS operations_approval_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trust_id UUID NOT NULL REFERENCES operations_trusts(id) ON DELETE RESTRICT,
  approval_request_id UUID NOT NULL REFERENCES operations_approval_requests(id) ON DELETE RESTRICT,
  action TEXT NOT NULL
    CHECK (action IN ('submit', 'approve', 'reject', 'post', 'reverse', 'cancel')),
  actor_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS operations_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trust_id UUID NOT NULL REFERENCES operations_trusts(id) ON DELETE RESTRICT,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  action TEXT NOT NULL,
  actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  request_id TEXT,
  request_ip INET,
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS operations_donations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trust_id UUID NOT NULL REFERENCES operations_trusts(id) ON DELETE RESTRICT,
  person_id UUID NOT NULL REFERENCES operations_people(id) ON DELETE RESTRICT,
  payment_event_id UUID REFERENCES operations_payment_events(id) ON DELETE SET NULL,
  transaction_id UUID REFERENCES operations_transactions(id) ON DELETE SET NULL,
  donation_number TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending_approval', 'verified', 'posted', 'refunded', 'cancelled')),
  amount NUMERIC(19,4) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'INR' CHECK (currency ~ '^[A-Z]{3}$'),
  donation_date DATE NOT NULL DEFAULT CURRENT_DATE,
  purpose TEXT,
  payment_mode TEXT CHECK (payment_mode IS NULL OR payment_mode IN ('cash', 'digital', 'bank_transfer', 'cheque', 'other')),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  posted_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS operations_donation_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trust_id UUID NOT NULL REFERENCES operations_trusts(id) ON DELETE RESTRICT,
  donation_id UUID NOT NULL REFERENCES operations_donations(id) ON DELETE RESTRICT,
  fund_id UUID NOT NULL REFERENCES operations_funds(id) ON DELETE RESTRICT,
  amount NUMERIC(19,4) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'INR' CHECK (currency ~ '^[A-Z]{3}$'),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS operations_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trust_id UUID NOT NULL REFERENCES operations_trusts(id) ON DELETE RESTRICT,
  person_id UUID NOT NULL REFERENCES operations_people(id) ON DELETE RESTRICT,
  transaction_id UUID REFERENCES operations_transactions(id) ON DELETE SET NULL,
  invoice_number TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending_approval', 'approved', 'sent', 'partially_paid', 'paid', 'overdue', 'cancelled')),
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  subtotal NUMERIC(19,4) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  tax_amount NUMERIC(19,4) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  total_amount NUMERIC(19,4) NOT NULL CHECK (total_amount > 0),
  paid_amount NUMERIC(19,4) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0 AND paid_amount <= total_amount),
  currency TEXT NOT NULL DEFAULT 'INR' CHECK (currency ~ '^[A-Z]{3}$'),
  approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  sent_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (due_date IS NULL OR due_date >= issue_date)
);

CREATE TABLE IF NOT EXISTS operations_invoice_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trust_id UUID NOT NULL REFERENCES operations_trusts(id) ON DELETE RESTRICT,
  invoice_id UUID NOT NULL REFERENCES operations_invoices(id) ON DELETE RESTRICT,
  line_number INTEGER NOT NULL CHECK (line_number > 0),
  description TEXT NOT NULL,
  quantity NUMERIC(19,4) NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(19,4) NOT NULL CHECK (unit_price >= 0),
  line_amount NUMERIC(19,4) NOT NULL CHECK (line_amount >= 0),
  tax_amount NUMERIC(19,4) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  currency TEXT NOT NULL DEFAULT 'INR' CHECK (currency ~ '^[A-Z]{3}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (trust_id, invoice_id, line_number)
);

CREATE TABLE IF NOT EXISTS operations_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trust_id UUID NOT NULL REFERENCES operations_trusts(id) ON DELETE RESTRICT,
  donation_id UUID NOT NULL REFERENCES operations_donations(id) ON DELETE RESTRICT,
  receipt_number TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'issued', 'sent', 'voided')),
  amount NUMERIC(19,4) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'INR' CHECK (currency ~ '^[A-Z]{3}$'),
  issued_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  document_path TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS operations_document_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trust_id UUID NOT NULL REFERENCES operations_trusts(id) ON DELETE RESTRICT,
  template_type TEXT NOT NULL CHECK (template_type IN ('receipt', 'invoice', 'payslip')),
  name TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  template_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (trust_id, template_type, name, version)
);

CREATE TABLE IF NOT EXISTS operations_document_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trust_id UUID NOT NULL REFERENCES operations_trusts(id) ON DELETE RESTRICT,
  receipt_id UUID REFERENCES operations_receipts(id) ON DELETE RESTRICT,
  invoice_id UUID REFERENCES operations_invoices(id) ON DELETE RESTRICT,
  delivery_type TEXT NOT NULL CHECK (delivery_type IN ('receipt', 'invoice', 'combined')),
  recipient_email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'sent', 'retrying', 'failed', 'completed')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  last_error TEXT,
  provider_message_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (receipt_id IS NOT NULL OR invoice_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS operations_fund_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trust_id UUID NOT NULL REFERENCES operations_trusts(id) ON DELETE RESTRICT,
  fund_id UUID NOT NULL REFERENCES operations_funds(id) ON DELETE RESTRICT,
  transaction_id UUID REFERENCES operations_transactions(id) ON DELETE SET NULL,
  donation_id UUID REFERENCES operations_donations(id) ON DELETE SET NULL,
  invoice_id UUID REFERENCES operations_invoices(id) ON DELETE SET NULL,
  allocation_type TEXT NOT NULL
    CHECK (allocation_type IN ('donation', 'expense', 'transfer', 'payroll', 'other')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'posted', 'reversed', 'cancelled')),
  amount NUMERIC(19,4) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'INR' CHECK (currency ~ '^[A-Z]{3}$'),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (transaction_id IS NOT NULL OR donation_id IS NOT NULL OR invoice_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS operations_fund_commitments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trust_id UUID NOT NULL REFERENCES operations_trusts(id) ON DELETE RESTRICT,
  fund_id UUID NOT NULL REFERENCES operations_funds(id) ON DELETE RESTRICT,
  invoice_id UUID REFERENCES operations_invoices(id) ON DELETE SET NULL,
  commitment_type TEXT NOT NULL DEFAULT 'expense',
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'approved', 'committed', 'released', 'fulfilled', 'cancelled')),
  amount NUMERIC(19,4) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'INR' CHECK (currency ~ '^[A-Z]{3}$'),
  description TEXT,
  committed_at TIMESTAMPTZ,
  fulfilled_at TIMESTAMPTZ,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS operations_fund_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trust_id UUID NOT NULL REFERENCES operations_trusts(id) ON DELETE RESTRICT,
  from_fund_id UUID NOT NULL REFERENCES operations_funds(id) ON DELETE RESTRICT,
  to_fund_id UUID NOT NULL REFERENCES operations_funds(id) ON DELETE RESTRICT,
  transaction_id UUID REFERENCES operations_transactions(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending_approval'
    CHECK (status IN ('pending_approval', 'approved', 'posted', 'reversed', 'cancelled')),
  amount NUMERIC(19,4) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'INR' CHECK (currency ~ '^[A-Z]{3}$'),
  reason TEXT NOT NULL,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  posted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (from_fund_id <> to_fund_id)
);

CREATE TABLE IF NOT EXISTS operations_number_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trust_id UUID NOT NULL REFERENCES operations_trusts(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK (document_type ~ '^[a-z][a-z0-9_]{1,31}$'),
  financial_year TEXT NOT NULL CHECK (financial_year ~ '^[0-9]{4}(-[0-9]{2,4})?$'),
  next_value BIGINT NOT NULL DEFAULT 1 CHECK (next_value > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (trust_id, document_type, financial_year)
);

CREATE TABLE IF NOT EXISTS operations_employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trust_id UUID NOT NULL REFERENCES operations_trusts(id) ON DELETE RESTRICT,
  person_id UUID NOT NULL REFERENCES operations_people(id) ON DELETE RESTRICT,
  employee_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'on_leave', 'inactive', 'terminated')),
  start_date DATE NOT NULL,
  end_date DATE,
  pan TEXT,
  uan TEXT,
  pf_number TEXT,
  esi_number TEXT,
  professional_tax_state TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (trust_id, employee_code),
  CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS operations_salary_structures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trust_id UUID NOT NULL REFERENCES operations_trusts(id) ON DELETE RESTRICT,
  employee_id UUID NOT NULL REFERENCES operations_employees(id) ON DELETE RESTRICT,
  structure_version INTEGER NOT NULL DEFAULT 1 CHECK (structure_version > 0),
  effective_from DATE NOT NULL,
  effective_to DATE,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'retired')),
  currency TEXT NOT NULL DEFAULT 'INR' CHECK (currency ~ '^[A-Z]{3}$'),
  gross_amount NUMERIC(19,4) NOT NULL DEFAULT 0 CHECK (gross_amount >= 0),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (trust_id, employee_id, structure_version),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE TABLE IF NOT EXISTS operations_salary_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trust_id UUID NOT NULL REFERENCES operations_trusts(id) ON DELETE RESTRICT,
  salary_structure_id UUID NOT NULL REFERENCES operations_salary_structures(id) ON DELETE RESTRICT,
  component_code TEXT NOT NULL,
  component_name TEXT NOT NULL,
  component_type TEXT NOT NULL
    CHECK (component_type IN ('basic', 'allowance', 'deduction', 'tax', 'pf', 'esi', 'professional_tax', 'other')),
  calculation_type TEXT NOT NULL DEFAULT 'fixed'
    CHECK (calculation_type IN ('fixed', 'percentage')),
  amount NUMERIC(19,4) NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'INR' CHECK (currency ~ '^[A-Z]{3}$'),
  is_taxable BOOLEAN NOT NULL DEFAULT TRUE,
  is_employer_contribution BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (trust_id, salary_structure_id, component_code)
);

CREATE TABLE IF NOT EXISTS operations_payroll_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trust_id UUID NOT NULL REFERENCES operations_trusts(id) ON DELETE RESTRICT,
  period_name TEXT NOT NULL,
  financial_year TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'processing', 'closed')),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (trust_id, period_name),
  CHECK (period_end >= period_start)
);

CREATE TABLE IF NOT EXISTS operations_payroll_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trust_id UUID NOT NULL REFERENCES operations_trusts(id) ON DELETE RESTRICT,
  payroll_period_id UUID NOT NULL REFERENCES operations_payroll_periods(id) ON DELETE RESTRICT,
  run_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending_approval', 'approved', 'posted', 'paid', 'cancelled')),
  currency TEXT NOT NULL DEFAULT 'INR' CHECK (currency ~ '^[A-Z]{3}$'),
  gross_total NUMERIC(19,4) NOT NULL DEFAULT 0 CHECK (gross_total >= 0),
  deduction_total NUMERIC(19,4) NOT NULL DEFAULT 0 CHECK (deduction_total >= 0),
  net_total NUMERIC(19,4) NOT NULL DEFAULT 0 CHECK (net_total >= 0),
  journal_entry_id UUID REFERENCES operations_journal_entries(id) ON DELETE SET NULL,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  posted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (trust_id, run_number),
  UNIQUE (trust_id, payroll_period_id)
);

CREATE TABLE IF NOT EXISTS operations_payroll_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trust_id UUID NOT NULL REFERENCES operations_trusts(id) ON DELETE RESTRICT,
  payroll_run_id UUID NOT NULL REFERENCES operations_payroll_runs(id) ON DELETE RESTRICT,
  employee_id UUID NOT NULL REFERENCES operations_employees(id) ON DELETE RESTRICT,
  salary_structure_id UUID REFERENCES operations_salary_structures(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'approved', 'posted', 'paid', 'cancelled')),
  gross_amount NUMERIC(19,4) NOT NULL DEFAULT 0 CHECK (gross_amount >= 0),
  deduction_amount NUMERIC(19,4) NOT NULL DEFAULT 0 CHECK (deduction_amount >= 0),
  net_amount NUMERIC(19,4) NOT NULL DEFAULT 0 CHECK (net_amount >= 0),
  currency TEXT NOT NULL DEFAULT 'INR' CHECK (currency ~ '^[A-Z]{3}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (trust_id, payroll_run_id, employee_id)
);

CREATE TABLE IF NOT EXISTS operations_payroll_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trust_id UUID NOT NULL REFERENCES operations_trusts(id) ON DELETE RESTRICT,
  payroll_run_id UUID NOT NULL REFERENCES operations_payroll_runs(id) ON DELETE RESTRICT,
  payroll_line_id UUID REFERENCES operations_payroll_lines(id) ON DELETE SET NULL,
  adjustment_type TEXT NOT NULL
    CHECK (adjustment_type IN ('allowance', 'deduction', 'tax', 'bonus', 'reimbursement', 'other')),
  amount NUMERIC(19,4) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'INR' CHECK (currency ~ '^[A-Z]{3}$'),
  reason TEXT NOT NULL,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS operations_payslips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trust_id UUID NOT NULL REFERENCES operations_trusts(id) ON DELETE RESTRICT,
  payroll_run_id UUID NOT NULL REFERENCES operations_payroll_runs(id) ON DELETE RESTRICT,
  payroll_line_id UUID NOT NULL REFERENCES operations_payroll_lines(id) ON DELETE RESTRICT,
  payslip_number TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'issued', 'sent', 'voided')),
  gross_amount NUMERIC(19,4) NOT NULL CHECK (gross_amount >= 0),
  deduction_amount NUMERIC(19,4) NOT NULL CHECK (deduction_amount >= 0),
  net_amount NUMERIC(19,4) NOT NULL CHECK (net_amount >= 0),
  currency TEXT NOT NULL DEFAULT 'INR' CHECK (currency ~ '^[A-Z]{3}$'),
  issued_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  document_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS operations_payroll_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trust_id UUID NOT NULL REFERENCES operations_trusts(id) ON DELETE RESTRICT,
  payroll_run_id UUID NOT NULL REFERENCES operations_payroll_runs(id) ON DELETE RESTRICT,
  employee_id UUID NOT NULL REFERENCES operations_employees(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'reversed')),
  amount NUMERIC(19,4) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'INR' CHECK (currency ~ '^[A-Z]{3}$'),
  payment_reference TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS operations_automation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trust_id UUID NOT NULL REFERENCES operations_trusts(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'retrying', 'completed', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at TIMESTAMPTZ,
  last_error TEXT,
  event_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS operations_people_normalized_email_uidx
  ON operations_people (normalized_email)
  WHERE normalized_email IS NOT NULL;

CREATE INDEX IF NOT EXISTS operations_trust_settings_filter_idx
  ON operations_trust_settings (trust_id, setting_key);
CREATE INDEX IF NOT EXISTS operations_trust_people_filter_idx
  ON operations_trust_people (trust_id, person_id);
CREATE INDEX IF NOT EXISTS operations_payment_events_filter_idx
  ON operations_payment_events (trust_id, status, received_at);
CREATE INDEX IF NOT EXISTS operations_funds_filter_idx
  ON operations_funds (trust_id, status);
CREATE INDEX IF NOT EXISTS operations_fund_budgets_filter_idx
  ON operations_fund_budgets (trust_id, financial_year, fund_id);
CREATE INDEX IF NOT EXISTS operations_transactions_filter_idx
  ON operations_transactions (trust_id, transaction_date, status);
CREATE INDEX IF NOT EXISTS operations_journal_entries_filter_idx
  ON operations_journal_entries (trust_id, entry_date, status);
CREATE INDEX IF NOT EXISTS operations_journal_lines_filter_idx
  ON operations_journal_lines (trust_id, journal_entry_id);
CREATE INDEX IF NOT EXISTS operations_approval_requests_filter_idx
  ON operations_approval_requests (trust_id, status, requested_at);
CREATE INDEX IF NOT EXISTS operations_approval_actions_filter_idx
  ON operations_approval_actions (trust_id, approval_request_id, created_at);
CREATE INDEX IF NOT EXISTS operations_audit_events_filter_idx
  ON operations_audit_events (trust_id, created_at);
CREATE INDEX IF NOT EXISTS operations_donations_filter_idx
  ON operations_donations (trust_id, donation_date, status);
CREATE INDEX IF NOT EXISTS operations_donation_allocations_filter_idx
  ON operations_donation_allocations (trust_id, donation_id);
CREATE INDEX IF NOT EXISTS operations_invoices_filter_idx
  ON operations_invoices (trust_id, status, due_date);
CREATE INDEX IF NOT EXISTS operations_invoice_lines_filter_idx
  ON operations_invoice_lines (trust_id, invoice_id, line_number);
CREATE INDEX IF NOT EXISTS operations_receipts_filter_idx
  ON operations_receipts (trust_id, status, issued_at);
CREATE INDEX IF NOT EXISTS operations_document_templates_filter_idx
  ON operations_document_templates (trust_id, template_type, is_active);
CREATE INDEX IF NOT EXISTS operations_document_deliveries_filter_idx
  ON operations_document_deliveries (trust_id, status, next_attempt_at);
CREATE INDEX IF NOT EXISTS operations_fund_allocations_filter_idx
  ON operations_fund_allocations (trust_id, fund_id, status);
CREATE INDEX IF NOT EXISTS operations_fund_commitments_filter_idx
  ON operations_fund_commitments (trust_id, fund_id, status);
CREATE INDEX IF NOT EXISTS operations_fund_transfers_filter_idx
  ON operations_fund_transfers (trust_id, status, created_at);
CREATE INDEX IF NOT EXISTS operations_number_sequences_filter_idx
  ON operations_number_sequences (trust_id, document_type, financial_year);
CREATE INDEX IF NOT EXISTS operations_employees_filter_idx
  ON operations_employees (trust_id, status);
CREATE INDEX IF NOT EXISTS operations_salary_structures_filter_idx
  ON operations_salary_structures (trust_id, employee_id, effective_from);
CREATE INDEX IF NOT EXISTS operations_salary_components_filter_idx
  ON operations_salary_components (trust_id, salary_structure_id);
CREATE INDEX IF NOT EXISTS operations_payroll_periods_filter_idx
  ON operations_payroll_periods (trust_id, period_start, status);
CREATE INDEX IF NOT EXISTS operations_payroll_runs_filter_idx
  ON operations_payroll_runs (trust_id, payroll_period_id, status);
CREATE INDEX IF NOT EXISTS operations_payroll_lines_filter_idx
  ON operations_payroll_lines (trust_id, payroll_run_id, employee_id);
CREATE INDEX IF NOT EXISTS operations_payroll_adjustments_filter_idx
  ON operations_payroll_adjustments (trust_id, payroll_run_id, created_at);
CREATE INDEX IF NOT EXISTS operations_payslips_filter_idx
  ON operations_payslips (trust_id, status, issued_at);
CREATE INDEX IF NOT EXISTS operations_payroll_payments_filter_idx
  ON operations_payroll_payments (trust_id, status, paid_at);
CREATE INDEX IF NOT EXISTS operations_automation_events_filter_idx
  ON operations_automation_events (trust_id, status, next_attempt_at);
