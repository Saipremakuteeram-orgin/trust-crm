-- Trust CRM combined Supabase schema bundle
-- Generated from backend/src/migrations/*.sql in numeric order.
-- CLEAN DATABASE ONLY: use the migration runner for an existing database.
-- The bundle records versions in public.schema_migrations after each section.

BEGIN;
SET LOCAL search_path = public;

-- -----------------------------------------------------------------------------
-- Migration 000_schema_migrations.sql
-- -----------------------------------------------------------------------------
-- Migration 000 — Create schema_migrations table

CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(3) PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE schema_migrations IS 'Tracks which migration files have been applied';

INSERT INTO public.schema_migrations (version)
VALUES ('000')
ON CONFLICT (version) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Migration 001_create_functions.sql
-- -----------------------------------------------------------------------------
-- Functions budget system migration
-- Run this in Supabase SQL Editor

-- 1. Create functions table
CREATE TABLE IF NOT EXISTS functions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  budget_total NUMERIC(15,2) NOT NULL DEFAULT 0,
  budget_cash NUMERIC(15,2) NOT NULL DEFAULT 0,
  budget_digital NUMERIC(15,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create function_categories table (optional category breakdown)
CREATE TABLE IF NOT EXISTS function_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  function_id UUID REFERENCES functions(id) ON DELETE CASCADE,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  budget_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  budget_cash NUMERIC(15,2) NOT NULL DEFAULT 0,
  budget_digital NUMERIC(15,2) NOT NULL DEFAULT 0,
  UNIQUE(function_id, category_id)
);

-- 3. Add function_id and function_category_id to transactions
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS function_id UUID REFERENCES functions(id) ON DELETE SET NULL;

ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS function_category_id UUID REFERENCES function_categories(id) ON DELETE SET NULL;

-- 4. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_transactions_function_id ON transactions(function_id);
CREATE INDEX IF NOT EXISTS idx_transactions_function_category_id ON transactions(function_category_id);
CREATE INDEX IF NOT EXISTS idx_functions_status ON functions(status);
CREATE INDEX IF NOT EXISTS idx_function_categories_function_id ON function_categories(function_id);

-- 5. Updated_at trigger for functions
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_functions_updated_at ON functions;
CREATE TRIGGER update_functions_updated_at
  BEFORE UPDATE ON functions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 6. View for function budget summary (computed spent/remaining)
CREATE OR REPLACE VIEW v_function_budget_summary AS
SELECT
  f.id,
  f.name,
  f.description,
  f.budget_total,
  f.budget_cash,
  f.budget_digital,
  f.status,
  f.created_by,
  f.created_at,
  f.updated_at,
  COALESCE(SUM(CASE WHEN t.type = 'debit' AND t.mode = 'cash' THEN t.amount ELSE 0 END), 0) AS spent_cash,
  COALESCE(SUM(CASE WHEN t.type = 'debit' AND t.mode = 'digital' THEN t.amount ELSE 0 END), 0) AS spent_digital,
  COALESCE(SUM(CASE WHEN t.type = 'debit' THEN t.amount ELSE 0 END), 0) AS spent_total,
  COALESCE(SUM(CASE WHEN t.type = 'credit' AND t.mode = 'cash' THEN t.amount ELSE 0 END), 0) AS income_cash,
  COALESCE(SUM(CASE WHEN t.type = 'credit' AND t.mode = 'digital' THEN t.amount ELSE 0 END), 0) AS income_digital,
  (f.budget_cash - COALESCE(SUM(CASE WHEN t.type = 'debit' AND t.mode = 'cash' THEN t.amount ELSE 0 END), 0)) AS remaining_cash,
  (f.budget_digital - COALESCE(SUM(CASE WHEN t.type = 'debit' AND t.mode = 'digital' THEN t.amount ELSE 0 END), 0)) AS remaining_digital,
  (f.budget_total - COALESCE(SUM(CASE WHEN t.type = 'debit' THEN t.amount ELSE 0 END), 0)) AS remaining_total,
  CASE
    WHEN f.budget_cash > 0 AND COALESCE(SUM(CASE WHEN t.type = 'debit' AND t.mode = 'cash' THEN t.amount ELSE 0 END), 0) > f.budget_cash THEN true
    ELSE false
  END AS overspend_cash,
  CASE
    WHEN f.budget_digital > 0 AND COALESCE(SUM(CASE WHEN t.type = 'debit' AND t.mode = 'digital' THEN t.amount ELSE 0 END), 0) > f.budget_digital THEN false
    ELSE false
  END AS overspend_digital,
  CASE
    WHEN f.budget_total > 0 AND COALESCE(SUM(CASE WHEN t.type = 'debit' THEN t.amount ELSE 0 END), 0) > f.budget_total THEN true
    ELSE false
  END AS overspend_total
FROM functions f
LEFT JOIN transactions t ON t.function_id = f.id
GROUP BY f.id, f.name, f.description, f.budget_total, f.budget_cash, f.budget_digital, f.status, f.created_by, f.created_at, f.updated_at;

-- 7. View for function category budget summary
CREATE OR REPLACE VIEW v_function_category_budget AS
SELECT
  fc.id,
  fc.function_id,
  fc.category_id,
  c.name AS category_name,
  fc.budget_amount,
  fc.budget_cash,
  fc.budget_digital,
  COALESCE(SUM(CASE WHEN t.type = 'debit' AND t.mode = 'cash' THEN t.amount ELSE 0 END), 0) AS spent_cash,
  COALESCE(SUM(CASE WHEN t.type = 'debit' AND t.mode = 'digital' THEN t.amount ELSE 0 END), 0) AS spent_digital,
  COALESCE(SUM(CASE WHEN t.type = 'debit' THEN t.amount ELSE 0 END), 0) AS spent_total,
  (fc.budget_cash - COALESCE(SUM(CASE WHEN t.type = 'debit' AND t.mode = 'cash' THEN t.amount ELSE 0 END), 0)) AS remaining_cash,
  (fc.budget_digital - COALESCE(SUM(CASE WHEN t.type = 'debit' AND t.mode = 'digital' THEN t.amount ELSE 0 END), 0)) AS remaining_digital,
  (fc.budget_amount - COALESCE(SUM(CASE WHEN t.type = 'debit' THEN t.amount ELSE 0 END), 0)) AS remaining_total
FROM function_categories fc
LEFT JOIN categories c ON c.id = fc.category_id
LEFT JOIN transactions t ON t.function_category_id = fc.id
GROUP BY fc.id, fc.function_id, fc.category_id, c.name, fc.budget_amount, fc.budget_cash, fc.budget_digital;

-- 8. View for source balance (cash/digital income vs function expenses)
CREATE OR REPLACE VIEW v_source_balance AS
SELECT
  COALESCE(SUM(CASE WHEN t.type = 'credit' AND t.mode = 'cash' THEN t.amount ELSE 0 END), 0) AS total_cash_income,
  COALESCE(SUM(CASE WHEN t.type = 'credit' AND t.mode = 'digital' THEN t.amount ELSE 0 END), 0) AS total_digital_income,
  COALESCE(SUM(CASE WHEN t.type = 'debit' AND t.mode = 'cash' AND t.function_id IS NOT NULL THEN t.amount ELSE 0 END), 0) AS total_cash_function_expenses,
  COALESCE(SUM(CASE WHEN t.type = 'debit' AND t.mode = 'digital' AND t.function_id IS NOT NULL THEN t.amount ELSE 0 END), 0) AS total_digital_function_expenses,
  COALESCE(SUM(CASE WHEN f.budget_cash IS NOT NULL THEN f.budget_cash ELSE 0 END), 0) AS total_allocated_cash_budget,
  COALESCE(SUM(CASE WHEN f.budget_digital IS NOT NULL THEN f.budget_digital ELSE 0 END), 0) AS total_allocated_digital_budget
FROM transactions t
FULL OUTER JOIN functions f ON true
WHERE t.type IS NOT NULL OR f.id IS NOT NULL;

-- 9. RLS Policies (adjust based on your auth setup)
ALTER TABLE functions ENABLE ROW LEVEL SECURITY;
ALTER TABLE function_categories ENABLE ROW LEVEL SECURITY;

-- Functions: authenticated users can view, admin/accountant can manage
CREATE POLICY "Functions viewable by authenticated" ON functions
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Functions manageable by admin/accountant" ON functions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'accountant')
    )
  );

-- Function categories: similar to functions
CREATE POLICY "Function categories viewable by authenticated" ON function_categories
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Function categories manageable by admin/accountant" ON function_categories
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
      AND p.role IN ('admin', 'accountant')
    )
  );

INSERT INTO public.schema_migrations (version)
VALUES ('001')
ON CONFLICT (version) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Migration 002_function_category_items.sql
-- -----------------------------------------------------------------------------
-- 10. Function category items (line items within a sub-category)
CREATE TABLE IF NOT EXISTS function_category_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  function_category_id UUID REFERENCES function_categories(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  quantity NUMERIC(15,2) NOT NULL DEFAULT 1,
  unit_price NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_function_category_items_fc_id ON function_category_items(function_category_id);

CREATE OR REPLACE FUNCTION update_function_category_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_function_category_items_updated_at ON function_category_items;
CREATE TRIGGER update_function_category_items_updated_at
  BEFORE UPDATE ON function_category_items
  FOR EACH ROW EXECUTE FUNCTION update_function_category_items_updated_at();

ALTER TABLE function_category_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Function category items viewable by authenticated" ON function_category_items
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Function category items manageable by admin/accountant" ON function_category_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM function_categories fc
      JOIN functions f ON f.id = fc.function_id
      JOIN profiles p ON p.id = auth.uid()
      WHERE fc.id = function_category_items.function_category_id
      AND p.role IN ('admin', 'accountant')
    )
  );

INSERT INTO public.schema_migrations (version)
VALUES ('002')
ON CONFLICT (version) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Migration 003_update_views_for_items.sql
-- -----------------------------------------------------------------------------
-- 11. Update views to include function_category_items totals

-- Update function category budget summary to include item totals
CREATE OR REPLACE VIEW v_function_category_budget AS
SELECT
  fc.id,
  fc.function_id,
  fc.category_id,
  c.name AS category_name,
  fc.budget_amount,
  fc.budget_cash,
  fc.budget_digital,
  COALESCE(SUM(CASE WHEN t.type = 'debit' AND t.mode = 'cash' THEN t.amount ELSE 0 END), 0) AS spent_cash,
  COALESCE(SUM(CASE WHEN t.type = 'debit' AND t.mode = 'digital' THEN t.amount ELSE 0 END), 0) AS spent_digital,
  COALESCE(SUM(CASE WHEN t.type = 'debit' THEN t.amount ELSE 0 END), 0) + COALESCE(i.item_total, 0) AS spent_total,
  (fc.budget_cash - COALESCE(SUM(CASE WHEN t.type = 'debit' AND t.mode = 'cash' THEN t.amount ELSE 0 END), 0)) AS remaining_cash,
  (fc.budget_digital - COALESCE(SUM(CASE WHEN t.type = 'debit' AND t.mode = 'digital' THEN t.amount ELSE 0 END), 0)) AS remaining_digital,
  (fc.budget_amount - (COALESCE(SUM(CASE WHEN t.type = 'debit' THEN t.amount ELSE 0 END), 0) + COALESCE(i.item_total, 0))) AS remaining_total
FROM function_categories fc
LEFT JOIN categories c ON c.id = fc.category_id
LEFT JOIN transactions t ON t.function_category_id = fc.id
LEFT JOIN (
  SELECT function_category_id, SUM(total_amount) AS item_total
  FROM function_category_items
  GROUP BY function_category_id
) i ON i.function_category_id = fc.id
GROUP BY fc.id, fc.function_id, fc.category_id, c.name, fc.budget_amount, fc.budget_cash, fc.budget_digital, i.item_total;

-- Update function budget summary to include item totals
CREATE OR REPLACE VIEW v_function_budget_summary AS
SELECT
  f.id,
  f.name,
  f.description,
  f.budget_total,
  f.budget_cash,
  f.budget_digital,
  f.status,
  f.created_by,
  f.created_at,
  f.updated_at,
  COALESCE(SUM(CASE WHEN t.type = 'debit' AND t.mode = 'cash' THEN t.amount ELSE 0 END), 0) AS spent_cash,
  COALESCE(SUM(CASE WHEN t.type = 'debit' AND t.mode = 'digital' THEN t.amount ELSE 0 END), 0) AS spent_digital,
  COALESCE(SUM(CASE WHEN t.type = 'debit' THEN t.amount ELSE 0 END), 0) + COALESCE(fi.item_total, 0) AS spent_total,
  COALESCE(SUM(CASE WHEN t.type = 'credit' AND t.mode = 'cash' THEN t.amount ELSE 0 END), 0) AS income_cash,
  COALESCE(SUM(CASE WHEN t.type = 'credit' AND t.mode = 'digital' THEN t.amount ELSE 0 END), 0) AS income_digital,
  (f.budget_cash - COALESCE(SUM(CASE WHEN t.type = 'debit' AND t.mode = 'cash' THEN t.amount ELSE 0 END), 0)) AS remaining_cash,
  (f.budget_digital - COALESCE(SUM(CASE WHEN t.type = 'debit' AND t.mode = 'digital' THEN t.amount ELSE 0 END), 0)) AS remaining_digital,
  (f.budget_total - (COALESCE(SUM(CASE WHEN t.type = 'debit' THEN t.amount ELSE 0 END), 0) + COALESCE(fi.item_total, 0))) AS remaining_total,
  CASE
    WHEN f.budget_cash > 0 AND COALESCE(SUM(CASE WHEN t.type = 'debit' AND t.mode = 'cash' THEN t.amount ELSE 0 END), 0) > f.budget_cash THEN true
    ELSE false
  END AS overspend_cash,
  CASE
    WHEN f.budget_digital > 0 AND COALESCE(SUM(CASE WHEN t.type = 'debit' AND t.mode = 'digital' THEN t.amount ELSE 0 END), 0) > f.budget_digital THEN false
    ELSE false
  END AS overspend_digital,
  CASE
    WHEN f.budget_total > 0 AND (COALESCE(SUM(CASE WHEN t.type = 'debit' THEN t.amount ELSE 0 END), 0) + COALESCE(fi.item_total, 0)) > f.budget_total THEN true
    ELSE false
  END AS overspend_total
FROM functions f
LEFT JOIN transactions t ON t.function_id = f.id
LEFT JOIN (
  SELECT fc.function_id, SUM(i.total_amount) AS item_total
  FROM function_category_items i
  JOIN function_categories fc ON fc.id = i.function_category_id
  GROUP BY fc.function_id
) fi ON fi.function_id = f.id
GROUP BY f.id, f.name, f.description, f.budget_total, f.budget_cash, f.budget_digital, f.status, f.created_by, f.created_at, f.updated_at, fi.item_total;

INSERT INTO public.schema_migrations (version)
VALUES ('003')
ON CONFLICT (version) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Migration 004_rollup_function_budgets.sql
-- -----------------------------------------------------------------------------
-- 12. Auto-rollup sub-category budgets to parent function

CREATE OR REPLACE FUNCTION rollup_function_budgets()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE functions f
    SET
      budget_total = COALESCE((
        SELECT SUM(fc.budget_amount) FROM function_categories fc WHERE fc.function_id = OLD.function_id
      ), 0),
      budget_cash = COALESCE((
        SELECT SUM(fc.budget_cash) FROM function_categories fc WHERE fc.function_id = OLD.function_id
      ), 0),
      budget_digital = COALESCE((
        SELECT SUM(fc.budget_digital) FROM function_categories fc WHERE fc.function_id = OLD.function_id
      ), 0)
    WHERE f.id = OLD.function_id;
    RETURN OLD;
  END IF;

  UPDATE functions f
  SET
    budget_total = COALESCE((
      SELECT SUM(fc.budget_amount) FROM function_categories fc WHERE fc.function_id = NEW.function_id
    ), 0),
    budget_cash = COALESCE((
      SELECT SUM(fc.budget_cash) FROM function_categories fc WHERE fc.function_id = NEW.function_id
    ), 0),
    budget_digital = COALESCE((
      SELECT SUM(fc.budget_digital) FROM function_categories fc WHERE fc.function_id = NEW.function_id
    ), 0)
  WHERE f.id = NEW.function_id;
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS rollup_function_budgets_trigger ON function_categories;
CREATE TRIGGER rollup_function_budgets_trigger
  AFTER INSERT OR UPDATE OR DELETE ON function_categories
  FOR EACH ROW EXECUTE FUNCTION rollup_function_budgets();

INSERT INTO public.schema_migrations (version)
VALUES ('004')
ON CONFLICT (version) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Migration 005_chart_of_accounts_and_journal.sql
-- -----------------------------------------------------------------------------
-- 13. Chart of Accounts and Double Entry Journal System

-- Chart of Accounts table
CREATE TABLE IF NOT EXISTS chart_of_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('asset', 'liability', 'equity', 'income', 'expense')),
  parent_id UUID REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Journal Entries table (header)
CREATE TABLE IF NOT EXISTS journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_number TEXT NOT NULL UNIQUE,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT NOT NULL,
  reference TEXT,
  is_posted BOOLEAN DEFAULT false,
  posted_at TIMESTAMPTZ,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Journal Entry Lines table (debits and credits)
CREATE TABLE IF NOT EXISTS journal_entry_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_id UUID REFERENCES chart_of_accounts(id),
  description TEXT,
  debit NUMERIC(15,2) NOT NULL DEFAULT 0,
  credit NUMERIC(15,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_parent ON chart_of_accounts(parent_id);
CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_type ON chart_of_accounts(type);
CREATE INDEX IF NOT EXISTS idx_journal_entries_date ON journal_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_journal_entries_posted ON journal_entries(is_posted);
CREATE INDEX IF NOT EXISTS idx_journal_entry_lines_entry ON journal_entry_lines(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_entry_lines_account ON journal_entry_lines(account_id);

-- Account Balances view (running balance per account)
CREATE OR REPLACE VIEW v_account_balances AS
SELECT
  a.id AS account_id,
  a.account_code,
  a.name,
  a.type,
  a.parent_id,
  COALESCE(SUM(l.debit), 0) - COALESCE(SUM(l.credit), 0) AS balance,
  COALESCE(SUM(l.debit), 0) AS total_debit,
  COALESCE(SUM(l.credit), 0) AS total_credit,
  COUNT(DISTINCT e.id) AS entry_count
FROM chart_of_accounts a
LEFT JOIN journal_entry_lines l ON l.account_id = a.id
LEFT JOIN journal_entries e ON e.id = l.journal_entry_id AND e.is_posted = true
GROUP BY a.id, a.account_code, a.name, a.type, a.parent_id;

-- Function to generate entry numbers
CREATE OR REPLACE FUNCTION generate_journal_entry_number()
RETURNS TEXT AS $$
DECLARE
  next_num INTEGER;
  entry_num TEXT;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(entry_number FROM '[0-9]+') AS INTEGER)), 0) + 1
  INTO next_num
  FROM journal_entries
  WHERE entry_number ~ '^JE-[0-9]+$';

  entry_num := 'JE-' || LPAD(next_num::TEXT, 6, '0');
  RETURN entry_num;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at on chart_of_accounts
CREATE OR REPLACE FUNCTION update_chart_of_accounts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_chart_of_accounts_updated_at ON chart_of_accounts;
CREATE TRIGGER update_chart_of_accounts_updated_at
  BEFORE UPDATE ON chart_of_accounts
  FOR EACH ROW EXECUTE FUNCTION update_chart_of_accounts_updated_at();

-- Trigger for updated_at on journal_entries
CREATE OR REPLACE FUNCTION update_journal_entries_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_journal_entries_updated_at ON journal_entries;
CREATE TRIGGER update_journal_entries_updated_at
  BEFORE UPDATE ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION update_journal_entries_updated_at();

-- Row Level Security
ALTER TABLE chart_of_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entry_lines ENABLE ROW LEVEL SECURITY;

-- Chart of Accounts policies
CREATE POLICY "Chart of accounts viewable by authenticated" ON chart_of_accounts
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Chart of accounts manageable by admin" ON chart_of_accounts
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- Journal Entries policies
CREATE POLICY "Journal entries viewable by authenticated" ON journal_entries
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Journal entries manageable by admin/accountant" ON journal_entries
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'accountant'))
  );

-- Journal Entry Lines policies
CREATE POLICY "Journal entry lines viewable by authenticated" ON journal_entry_lines
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Journal entry lines manageable by admin/accountant" ON journal_entry_lines
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'accountant'))
  );

INSERT INTO public.schema_migrations (version)
VALUES ('005')
ON CONFLICT (version) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Migration 006_trustees_and_beneficiaries.sql
-- -----------------------------------------------------------------------------
-- 14. Trustees and Beneficiaries Registry

-- Trustees table
CREATE TABLE IF NOT EXISTS trustees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  appointment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  term_end DATE,
  role TEXT NOT NULL DEFAULT 'Trustee',
  designation TEXT,
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Beneficiaries table
CREATE TABLE IF NOT EXISTS beneficiaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  eligibility_start DATE NOT NULL DEFAULT CURRENT_DATE,
  eligibility_end DATE,
  category TEXT NOT NULL DEFAULT 'General',
  priority INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Beneficiary disbursements table
CREATE TABLE IF NOT EXISTS beneficiary_disbursements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  beneficiary_id UUID REFERENCES beneficiaries(id) ON DELETE CASCADE,
  amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  disbursement_date DATE NOT NULL DEFAULT CURRENT_DATE,
  purpose TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'cash' CHECK (mode IN ('cash', 'digital', 'cheque', 'bank_transfer')),
  reference_no TEXT,
  receipt_file_id UUID,
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_trustees_contact ON trustees(contact_id);
CREATE INDEX IF NOT EXISTS idx_trustees_active ON trustees(is_active);
CREATE INDEX IF NOT EXISTS idx_beneficiaries_contact ON beneficiaries(contact_id);
CREATE INDEX IF NOT EXISTS idx_beneficiaries_category ON beneficiaries(category);
CREATE INDEX IF NOT EXISTS idx_beneficiary_disbursements_beneficiary ON beneficiary_disbursements(beneficiary_id);
CREATE INDEX IF NOT EXISTS idx_beneficiary_disbursements_date ON beneficiary_disbursements(disbursement_date);

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION update_trustees_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_trustees_updated_at ON trustees;
CREATE TRIGGER update_trustees_updated_at
  BEFORE UPDATE ON trustees
  FOR EACH ROW EXECUTE FUNCTION update_trustees_updated_at();

CREATE OR REPLACE FUNCTION update_beneficiaries_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_beneficiaries_updated_at ON beneficiaries;
CREATE TRIGGER update_beneficiaries_updated_at
  BEFORE UPDATE ON beneficiaries
  FOR EACH ROW EXECUTE FUNCTION update_beneficiaries_updated_at();

CREATE OR REPLACE FUNCTION update_beneficiary_disbursements_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_beneficiary_disbursements_updated_at ON beneficiary_disbursements;
CREATE TRIGGER update_beneficiary_disbursements_updated_at
  BEFORE UPDATE ON beneficiary_disbursements
  FOR EACH ROW EXECUTE FUNCTION update_beneficiary_disbursements_updated_at();

-- Row Level Security
ALTER TABLE trustees ENABLE ROW LEVEL SECURITY;
ALTER TABLE beneficiaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE beneficiary_disbursements ENABLE ROW LEVEL SECURITY;

-- Trustees policies
CREATE POLICY "Trustees viewable by authenticated" ON trustees
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Trustees manageable by admin/accountant" ON trustees
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'accountant'))
  );

-- Beneficiaries policies
CREATE POLICY "Beneficiaries viewable by authenticated" ON beneficiaries
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Beneficiaries manageable by admin/accountant" ON beneficiaries
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'accountant'))
  );

-- Beneficiary disbursements policies
CREATE POLICY "Beneficiary disbursements viewable by authenticated" ON beneficiary_disbursements
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Beneficiary disbursements manageable by admin/accountant" ON beneficiary_disbursements
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'accountant'))
  );

INSERT INTO public.schema_migrations (version)
VALUES ('006')
ON CONFLICT (version) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Migration 007_compliance_calendar.sql
-- -----------------------------------------------------------------------------
-- 15. Compliance Calendar and Returns Tracking

-- Compliance items table (calendar events like FCRA, 12A, 80G, IT returns, etc.)
CREATE TABLE IF NOT EXISTS compliance_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'General' CHECK (category IN ('FCRA', '12A', '80G', 'Income Tax', 'Charity Commissioner', 'GST', 'TDS', 'Other')),
  frequency TEXT NOT NULL DEFAULT 'monthly' CHECK (frequency IN ('daily', 'weekly', 'monthly', 'quarterly', 'half-yearly', 'yearly', 'one-time')),
  due_date DATE NOT NULL,
  responsible_person TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in-progress', 'filed', 'overdue')),
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Compliance returns table (individual return filings)
CREATE TABLE IF NOT EXISTS compliance_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compliance_item_id UUID REFERENCES compliance_items(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  due_date DATE NOT NULL,
  filed_date DATE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in-progress', 'filed', 'overdue')),
  acknowledgement_number TEXT,
  file_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_compliance_items_category ON compliance_items(category);
CREATE INDEX IF NOT EXISTS idx_compliance_items_status ON compliance_items(status);
CREATE INDEX IF NOT EXISTS idx_compliance_items_due_date ON compliance_items(due_date);
CREATE INDEX IF NOT EXISTS idx_compliance_returns_item ON compliance_returns(compliance_item_id);
CREATE INDEX IF NOT EXISTS idx_compliance_returns_status ON compliance_returns(status);

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION update_compliance_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_compliance_items_updated_at ON compliance_items;
CREATE TRIGGER update_compliance_items_updated_at
  BEFORE UPDATE ON compliance_items
  FOR EACH ROW EXECUTE FUNCTION update_compliance_items_updated_at();

CREATE OR REPLACE FUNCTION update_compliance_returns_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_compliance_returns_updated_at ON compliance_returns;
CREATE TRIGGER update_compliance_returns_updated_at
  BEFORE UPDATE ON compliance_returns
  FOR EACH ROW EXECUTE FUNCTION update_compliance_returns_updated_at();

-- Row Level Security
ALTER TABLE compliance_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_returns ENABLE ROW LEVEL SECURITY;

-- Compliance items policies
CREATE POLICY "Compliance items viewable by authenticated" ON compliance_items
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Compliance items manageable by admin/accountant" ON compliance_items
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'accountant'))
  );

-- Compliance returns policies
CREATE POLICY "Compliance returns viewable by authenticated" ON compliance_returns
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Compliance returns manageable by admin/accountant" ON compliance_returns
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'accountant'))
  );

INSERT INTO public.schema_migrations (version)
VALUES ('007')
ON CONFLICT (version) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Migration 008_donation_receipts.sql
-- -----------------------------------------------------------------------------
-- 16. Donation Receipts and Certificates

-- Donation receipts table
CREATE TABLE IF NOT EXISTS donation_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number TEXT NOT NULL UNIQUE,
  transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  donor_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  receipt_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_mode TEXT NOT NULL DEFAULT 'cash' CHECK (payment_mode IN ('cash', 'digital', 'cheque', 'bank_transfer')),
  section_80g BOOLEAN DEFAULT false,
  section_12a BOOLEAN DEFAULT false,
  acknowledgement_number TEXT,
  pan_number TEXT,
  address TEXT,
  notes TEXT,
  issued_by UUID REFERENCES profiles(id),
  issued_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_donation_receipts_donor ON donation_receipts(donor_id);
CREATE INDEX IF NOT EXISTS idx_donation_receipts_transaction ON donation_receipts(transaction_id);
CREATE INDEX IF NOT EXISTS idx_donation_receipts_receipt_number ON donation_receipts(receipt_number);
CREATE INDEX IF NOT EXISTS idx_donation_receipts_date ON donation_receipts(receipt_date);

-- Function to generate receipt numbers
CREATE OR REPLACE FUNCTION generate_receipt_number()
RETURNS TEXT AS $$
DECLARE
  next_num INTEGER;
  receipt_num TEXT;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(receipt_number FROM 'RCPT-[0-9]+') AS INTEGER)), 0) + 1
  INTO next_num
  FROM donation_receipts
  WHERE receipt_number ~ '^RCPT-[0-9]+$';

  receipt_num := 'RCPT-' || LPAD(next_num::TEXT, 8, '0');
  RETURN receipt_num;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_donation_receipts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_donation_receipts_updated_at ON donation_receipts;
CREATE TRIGGER update_donation_receipts_updated_at
  BEFORE UPDATE ON donation_receipts
  FOR EACH ROW EXECUTE FUNCTION update_donation_receipts_updated_at();

-- Row Level Security
ALTER TABLE donation_receipts ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Donation receipts viewable by authenticated" ON donation_receipts
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Donation receipts manageable by admin/accountant" ON donation_receipts
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'accountant'))
  );

INSERT INTO public.schema_migrations (version)
VALUES ('008')
ON CONFLICT (version) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Migration 009_bank_reconciliation.sql
-- -----------------------------------------------------------------------------
-- 17. Bank Reconciliation

-- Bank statements table
CREATE TABLE IF NOT EXISTS bank_statements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_name TEXT NOT NULL DEFAULT 'Unknown',
  account_number TEXT,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  file_url TEXT,
  uploaded_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Bank reconciliation items (individual entries from statement)
CREATE TABLE IF NOT EXISTS bank_reconciliation_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_statement_id UUID REFERENCES bank_statements(id) ON DELETE CASCADE,
  transaction_date DATE NOT NULL,
  description TEXT NOT NULL,
  amount NUMERIC(15,2) NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('credit', 'debit')),
  reference_no TEXT,
  status TEXT NOT NULL DEFAULT 'unmatched' CHECK (status IN ('unmatched', 'matched', 'ignored')),
  matched_transaction_id UUID REFERENCES transactions(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_bank_statements_period ON bank_statements(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_bank_reconciliation_items_statement ON bank_reconciliation_items(bank_statement_id);
CREATE INDEX IF NOT EXISTS idx_bank_reconciliation_items_status ON bank_reconciliation_items(status);
CREATE INDEX IF NOT EXISTS idx_bank_reconciliation_items_transaction ON bank_reconciliation_items(matched_transaction_id);

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION update_bank_statements_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_bank_statements_updated_at ON bank_statements;
CREATE TRIGGER update_bank_statements_updated_at
  BEFORE UPDATE ON bank_statements
  FOR EACH ROW EXECUTE FUNCTION update_bank_statements_updated_at();

CREATE OR REPLACE FUNCTION update_bank_reconciliation_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_bank_reconciliation_items_updated_at ON bank_reconciliation_items;
CREATE TRIGGER update_bank_reconciliation_items_updated_at
  BEFORE UPDATE ON bank_reconciliation_items
  FOR EACH ROW EXECUTE FUNCTION update_bank_reconciliation_items_updated_at();

-- Row Level Security
ALTER TABLE bank_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_reconciliation_items ENABLE ROW LEVEL SECURITY;

-- Bank statements policies
CREATE POLICY "Bank statements viewable by authenticated" ON bank_statements
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Bank statements manageable by admin/accountant" ON bank_statements
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'accountant'))
  );

-- Bank reconciliation items policies
CREATE POLICY "Bank reconciliation items viewable by authenticated" ON bank_reconciliation_items
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Bank reconciliation items manageable by admin/accountant" ON bank_reconciliation_items
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'accountant'))
  );

INSERT INTO public.schema_migrations (version)
VALUES ('009')
ON CONFLICT (version) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Migration 010_chart_of_accounts.sql
-- -----------------------------------------------------------------------------
-- Phase 1: Chart of Accounts + Double Entry Journal

-- Chart of Accounts
CREATE TABLE IF NOT EXISTS chart_of_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_code TEXT UNIQUE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('asset', 'liability', 'equity', 'income', 'expense')),
  parent_id UUID REFERENCES chart_of_accounts(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Journal Entries (header)
CREATE TABLE IF NOT EXISTS journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_number TEXT UNIQUE,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT NOT NULL,
  reference TEXT,
  is_posted BOOLEAN DEFAULT FALSE,
  posted_at TIMESTAMPTZ,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Journal Entry Lines (double-entry)
CREATE TABLE IF NOT EXISTS journal_entry_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_id UUID REFERENCES chart_of_accounts(id) NOT NULL,
  description TEXT,
  debit NUMERIC(15,2) NOT NULL DEFAULT 0,
  credit NUMERIC(15,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Account Balances view (running balance per account)
DROP VIEW IF EXISTS account_balances CASCADE;
CREATE OR REPLACE VIEW v_account_balances AS
SELECT
  coa.id AS account_id,
  coa.account_code,
  coa.name,
  coa.type,
  COALESCE(SUM(jel.debit - jel.credit), 0) AS balance,
  COUNT(jel.id) AS transaction_count
FROM chart_of_accounts coa
LEFT JOIN journal_entry_lines jel ON jel.account_id = coa.id
LEFT JOIN journal_entries je ON je.id = jel.journal_entry_id AND je.is_posted = TRUE
WHERE coa.is_active = TRUE
GROUP BY coa.id, coa.account_code, coa.name, coa.type;

-- Compatibility alias
CREATE VIEW account_balances AS SELECT * FROM v_account_balances;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_type ON chart_of_accounts(type);
CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_parent ON chart_of_accounts(parent_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_date ON journal_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_journal_entries_posted ON journal_entries(is_posted);
CREATE INDEX IF NOT EXISTS idx_journal_entry_lines_entry ON journal_entry_lines(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_entry_lines_account ON journal_entry_lines(account_id);

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION update_chart_of_accounts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_chart_of_accounts_updated_at ON chart_of_accounts;
CREATE TRIGGER update_chart_of_accounts_updated_at
  BEFORE UPDATE ON chart_of_accounts
  FOR EACH ROW EXECUTE FUNCTION update_chart_of_accounts_updated_at();

CREATE OR REPLACE FUNCTION update_journal_entries_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_journal_entries_updated_at ON journal_entries;
CREATE TRIGGER update_journal_entries_updated_at
  BEFORE UPDATE ON journal_entries
  FOR EACH ROW EXECUTE FUNCTION update_journal_entries_updated_at();

-- Sequence for journal entry numbers
CREATE SEQUENCE IF NOT EXISTS journal_entry_number_seq START 1;

-- Row Level Security
ALTER TABLE chart_of_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entry_lines ENABLE ROW LEVEL SECURITY;

-- Chart of Accounts policies
DROP POLICY IF EXISTS "Chart of accounts viewable by authenticated" ON chart_of_accounts;
CREATE POLICY "Chart of accounts viewable by authenticated" ON chart_of_accounts
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Chart of accounts manageable by admin" ON chart_of_accounts;
CREATE POLICY "Chart of accounts manageable by admin" ON chart_of_accounts
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- Journal entries policies
DROP POLICY IF EXISTS "Journal entries viewable by authenticated" ON journal_entries;
CREATE POLICY "Journal entries viewable by authenticated" ON journal_entries
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Journal entries manageable by admin/accountant" ON journal_entries;
CREATE POLICY "Journal entries manageable by admin/accountant" ON journal_entries
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'accountant'))
  );

-- Journal entry lines policies
DROP POLICY IF EXISTS "Journal entry lines viewable by authenticated" ON journal_entry_lines;
CREATE POLICY "Journal entry lines viewable by authenticated" ON journal_entry_lines
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Journal entry lines manageable by admin/accountant" ON journal_entry_lines;
CREATE POLICY "Journal entry lines manageable by admin/accountant" ON journal_entry_lines
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'accountant'))
  );

INSERT INTO public.schema_migrations (version)
VALUES ('010')
ON CONFLICT (version) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Migration 011_scheduled_reports.sql
-- -----------------------------------------------------------------------------
-- Scheduled Reports

CREATE TABLE IF NOT EXISTS scheduled_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_by UUID REFERENCES profiles(id),
  filter_type TEXT[],
  filter_mode TEXT[],
  filter_categories UUID[],
  filter_from DATE,
  filter_to DATE,
  schedule_type TEXT NOT NULL DEFAULT 'weekly',
  schedule_day INTEGER,
  schedule_hour INTEGER NOT NULL DEFAULT 8,
  schedule_minute INTEGER NOT NULL DEFAULT 0,
  format TEXT NOT NULL DEFAULT 'excel',
  delivery_email BOOLEAN DEFAULT TRUE,
  delivery_telegram BOOLEAN DEFAULT FALSE,
  recipient_mode TEXT NOT NULL DEFAULT 'subscribed',
  recipient_contact_ids UUID[],
  recipient_group_ids UUID[],
  enabled BOOLEAN DEFAULT TRUE,
  next_run_at TIMESTAMPTZ,
  last_run_at TIMESTAMPTZ,
  last_status TEXT,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_reports_enabled ON scheduled_reports(enabled);
CREATE INDEX IF NOT EXISTS idx_scheduled_reports_next_run ON scheduled_reports(next_run_at);

CREATE OR REPLACE FUNCTION update_scheduled_reports_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_scheduled_reports_updated_at ON scheduled_reports;
CREATE TRIGGER update_scheduled_reports_updated_at
  BEFORE UPDATE ON scheduled_reports
  FOR EACH ROW EXECUTE FUNCTION update_scheduled_reports_updated_at();

ALTER TABLE scheduled_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Scheduled reports viewable by admin/accountant" ON scheduled_reports
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'accountant'))
  );

CREATE POLICY "Scheduled reports manageable by admin/accountant" ON scheduled_reports
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'accountant'))
  );

INSERT INTO public.schema_migrations (version)
VALUES ('011')
ON CONFLICT (version) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Migration 012_webhook_website_event.sql
-- -----------------------------------------------------------------------------
-- 012_webhook_website_event.sql
-- Adds linkage columns so a website event maps 1:1 to a CRM budget Function.
-- Run this in the Supabase SQL Editor of the CRM project (twgunjmacbfqqpjpgrjt).
-- Safe to re-run (all operations are IF NOT EXISTS / idempotent).

ALTER TABLE functions ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE functions ADD COLUMN IF NOT EXISTS source_event_id TEXT;

-- Partial unique index: guarantees one Function per website event (idempotency).
CREATE UNIQUE INDEX IF NOT EXISTS idx_functions_source_event_id
  ON functions (source_event_id)
  WHERE source_event_id IS NOT NULL;

INSERT INTO public.schema_migrations (version)
VALUES ('012')
ON CONFLICT (version) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Migration 013_webhook_transaction_link.sql
-- -----------------------------------------------------------------------------
-- 013_webhook_transaction_link.sql
-- Adds linkage columns so a website donation maps 1:1 to a CRM transaction.
-- Run this in the Supabase SQL Editor of the CRM project (twgunjmacbfqqpjpgrjt).
-- Safe to re-run (all operations are IF NOT EXISTS / idempotent).

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS source_payment_id TEXT;

-- Partial unique index: guarantees one CRM transaction per Razorpay payment (idempotency).
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_source_payment_id
  ON transactions (source_payment_id)
  WHERE source_payment_id IS NOT NULL;

INSERT INTO public.schema_migrations (version)
VALUES ('013')
ON CONFLICT (version) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Migration 014_contacts_email_unique.sql
-- -----------------------------------------------------------------------------
-- 014_contacts_email_unique.sql
-- Adds a `source` column (tracks where a contact came from, e.g. website_registration)
-- and a unique index on contacts.email so website registrations can be
-- upserted (deduped) by email from the webhook.
-- Run in the CRM Supabase SQL editor (project twgunjmacbfqqpjpgrjt). Safe to re-run.

-- Linkage / source column (mirrors functions.transactions pattern).
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS source TEXT;

-- Unique index on email so upserts/dedup are safe.
CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_email
  ON contacts (email)
  WHERE email IS NOT NULL AND email <> '';

INSERT INTO public.schema_migrations (version)
VALUES ('014')
ON CONFLICT (version) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Migration 015_expense_scan_ocr.sql
-- -----------------------------------------------------------------------------
-- Handwritten expense capture and OCR review workflow.
-- Apply after the existing transaction/function migrations.

CREATE TABLE IF NOT EXISTS expense_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uploaded_by UUID NOT NULL REFERENCES profiles(id),
  storage_path TEXT NOT NULL,
  original_filename TEXT,
  mime_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ready'
    CHECK (status IN ('processing', 'ready', 'approved', 'failed', 'discarded')),
  raw_text TEXT NOT NULL DEFAULT '',
  ocr_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  detected_party TEXT,
  detected_date DATE,
  detected_total NUMERIC(12, 2),
  error_message TEXT,
  approved_by UUID REFERENCES profiles(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS expense_scan_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id UUID NOT NULL REFERENCES expense_scans(id) ON DELETE CASCADE,
  line_number INTEGER NOT NULL,
  item_name TEXT NOT NULL DEFAULT '',
  source_text TEXT NOT NULL DEFAULT '',
  quantity NUMERIC(12, 3) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  amount NUMERIC(12, 2) CHECK (amount IS NULL OR amount > 0),
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  confidence NUMERIC(5, 4) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  bounding_box JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (scan_id, line_number)
);

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS expense_scan_id UUID REFERENCES expense_scans(id) ON DELETE SET NULL;

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS expense_scan_item_id UUID REFERENCES expense_scan_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_expense_scans_uploaded_by ON expense_scans(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_expense_scans_status ON expense_scans(status);
CREATE INDEX IF NOT EXISTS idx_expense_scan_items_scan_id ON expense_scan_items(scan_id, line_number);
CREATE INDEX IF NOT EXISTS idx_transactions_expense_scan_id ON transactions(expense_scan_id);

CREATE OR REPLACE FUNCTION update_expense_scan_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS expense_scans_updated_at ON expense_scans;
CREATE TRIGGER expense_scans_updated_at
  BEFORE UPDATE ON expense_scans
  FOR EACH ROW EXECUTE FUNCTION update_expense_scan_updated_at();

DROP TRIGGER IF EXISTS expense_scan_items_updated_at ON expense_scan_items;
CREATE TRIGGER expense_scan_items_updated_at
  BEFORE UPDATE ON expense_scan_items
  FOR EACH ROW EXECUTE FUNCTION update_expense_scan_updated_at();

ALTER TABLE expense_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_scan_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Expense scans readable by owner or admin" ON expense_scans;
CREATE POLICY "Expense scans readable by owner or admin" ON expense_scans
  FOR SELECT USING (
    uploaded_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Expense scans writable by accountants" ON expense_scans;
CREATE POLICY "Expense scans writable by accountants" ON expense_scans
  FOR ALL USING (
    uploaded_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'accountant')
    )
  ) WITH CHECK (
    uploaded_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'accountant')
    )
  );

DROP POLICY IF EXISTS "Expense scan items readable through scan" ON expense_scan_items;
CREATE POLICY "Expense scan items readable through scan" ON expense_scan_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM expense_scans s
      WHERE s.id = scan_id
      AND (
        s.uploaded_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM profiles p
          WHERE p.id = auth.uid() AND p.role IN ('admin', 'accountant')
        )
      )
    )
  );

DROP POLICY IF EXISTS "Expense scan items writable by accountants" ON expense_scan_items;
CREATE POLICY "Expense scan items writable by accountants" ON expense_scan_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM expense_scans s
      WHERE s.id = scan_id
      AND EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid() AND p.role IN ('admin', 'accountant')
      )
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM expense_scans s
      WHERE s.id = scan_id
      AND EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid() AND p.role IN ('admin', 'accountant')
      )
    )
  );

DROP FUNCTION IF EXISTS approve_expense_scan(
  UUID, UUID, TEXT, DATE, TEXT, TEXT, BOOLEAN, UUID, UUID, UUID, UUID[]
);

CREATE OR REPLACE FUNCTION approve_expense_scan(
  p_scan_id UUID,
  p_user_id UUID,
  p_party TEXT,
  p_txn_date DATE,
  p_mode TEXT,
  p_digital_method TEXT,
  p_voucher_filed BOOLEAN,
  p_function_id UUID,
  p_function_category_id UUID,
  p_category_id UUID,
  p_notify_contact_ids UUID[]
)
RETURNS TABLE (transaction_id UUID, scan_item_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  scan_row expense_scans%ROWTYPE;
  item_row expense_scan_items%ROWTYPE;
  new_transaction_id UUID;
  transaction_party TEXT;
BEGIN
  IF p_scan_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'Scan and approving user are required';
  END IF;

  SELECT * INTO scan_row
  FROM expense_scans
  WHERE id = p_scan_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense scan not found';
  END IF;

  IF scan_row.status <> 'ready' THEN
    RAISE EXCEPTION 'Expense scan is not ready for approval';
  END IF;

  IF p_function_id IS NULL THEN
    RAISE EXCEPTION 'Function/event is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM functions f
    WHERE f.id = p_function_id AND f.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Selected function/event is not active';
  END IF;

  IF p_function_category_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM function_categories fc
    WHERE fc.id = p_function_category_id AND fc.function_id = p_function_id
  ) THEN
    RAISE EXCEPTION 'Selected event category does not belong to the function';
  END IF;

  IF p_mode NOT IN ('cash', 'digital') THEN
    RAISE EXCEPTION 'Invalid payment mode';
  END IF;

  IF p_mode = 'cash' AND p_voucher_filed IS NULL THEN
    RAISE EXCEPTION 'Voucher filed status is required for cash expenses';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM expense_scan_items i
    WHERE i.scan_id = p_scan_id AND i.amount IS NOT NULL AND i.amount > 0
  ) THEN
    RAISE EXCEPTION 'At least one item with a positive amount is required';
  END IF;

  IF EXISTS (
    SELECT 1 FROM expense_scan_items i
    WHERE i.scan_id = p_scan_id AND (i.amount IS NULL OR i.amount <= 0)
  ) THEN
    RAISE EXCEPTION 'Every expense item needs a positive amount';
  END IF;

  transaction_party = NULLIF(BTRIM(COALESCE(p_party, scan_row.detected_party, '')), '');

  FOR item_row IN
    SELECT *
    FROM expense_scan_items i
    WHERE i.scan_id = p_scan_id AND i.amount IS NOT NULL AND i.amount > 0
    ORDER BY i.line_number, i.created_at
  LOOP
    INSERT INTO transactions (
      type,
      mode,
      digital_method,
      amount,
      category_id,
      party,
      reference_no,
      description,
      txn_date,
      notify_contact_ids,
      voucher_filed,
      created_by,
      expense_scan_id,
      expense_scan_item_id
    ) VALUES (
      'debit'::txn_type,
      p_mode::payment_mode,
      CASE WHEN p_mode = 'digital' THEN p_digital_method::digital_method ELSE NULL END,
      item_row.amount,
      COALESCE(item_row.category_id, p_category_id),
      transaction_party,
      'OCR-' || LEFT(REPLACE(p_scan_id::TEXT, '-', ''), 12) || '-' || item_row.line_number,
      NULLIF(BTRIM(item_row.item_name), ''),
      COALESCE(p_txn_date, scan_row.detected_date, CURRENT_DATE),
      COALESCE(p_notify_contact_ids, '{}'::UUID[]),
      CASE WHEN p_mode = 'cash' THEN p_voucher_filed ELSE FALSE END,
      p_user_id,
      p_scan_id,
      item_row.id
    )
    RETURNING id INTO new_transaction_id;

    RETURN QUERY SELECT new_transaction_id, item_row.id;
  END LOOP;

  UPDATE expense_scans
  SET status = 'approved', approved_by = p_user_id, approved_at = NOW(), updated_at = NOW()
  WHERE id = p_scan_id;
END;
$$;

REVOKE ALL ON FUNCTION approve_expense_scan(
  UUID, UUID, TEXT, DATE, TEXT, TEXT, BOOLEAN, UUID, UUID, UUID, UUID[]
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION approve_expense_scan(
  UUID, UUID, TEXT, DATE, TEXT, TEXT, BOOLEAN, UUID, UUID, UUID, UUID[]
) TO service_role;

INSERT INTO public.schema_migrations (version)
VALUES ('015')
ON CONFLICT (version) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Migration 016_operations_foundation.sql
-- -----------------------------------------------------------------------------
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

INSERT INTO public.schema_migrations (version)
VALUES ('016')
ON CONFLICT (version) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Migration 017_operations_security.sql
-- -----------------------------------------------------------------------------
-- Additive Operations role helper, RLS policies, and immutable-state guards.

CREATE OR REPLACE FUNCTION operations_current_role_is(p_roles TEXT[])
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM profiles
    WHERE id = auth.uid()
      AND role::TEXT = ANY (p_roles)
  );
$$;

REVOKE ALL ON FUNCTION operations_current_role_is(TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION operations_current_role_is(TEXT[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION operations_guard_immutable_state()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_status TEXT := to_jsonb(OLD)->>'status';
  new_status TEXT := to_jsonb(NEW)->>'status';
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF old_status IN ('posted', 'sent', 'completed')
      OR (TG_TABLE_NAME = 'operations_journal_entries'
        AND COALESCE((to_jsonb(OLD)->>'is_posted')::BOOLEAN, FALSE)) THEN
      RAISE EXCEPTION 'Immutable operations record cannot be deleted: %', TG_TABLE_NAME;
    END IF;
    RETURN OLD;
  END IF;

  IF TG_TABLE_NAME = 'operations_journal_entries' AND old_status = 'posted' THEN
    RAISE EXCEPTION 'Posted journal entries are immutable';
  END IF;

  IF TG_TABLE_NAME = 'operations_journal_lines'
    AND EXISTS (
      SELECT 1
      FROM operations_journal_entries
      WHERE id = OLD.journal_entry_id AND status = 'posted'
    ) THEN
    RAISE EXCEPTION 'Lines belonging to a posted journal entry are immutable';
  END IF;

  IF TG_TABLE_NAME = 'operations_invoice_lines'
    AND EXISTS (
      SELECT 1
      FROM operations_invoices
      WHERE id = OLD.invoice_id AND status IN ('sent', 'partially_paid', 'paid', 'overdue')
    ) THEN
    RAISE EXCEPTION 'Lines belonging to a sent invoice are immutable';
  END IF;

  IF old_status IN ('posted', 'reversed') THEN
    RAISE EXCEPTION 'Posted or reversed operations records are immutable: %', TG_TABLE_NAME;
  END IF;

  IF TG_TABLE_NAME IN (
    'operations_receipts',
    'operations_payslips',
    'operations_document_deliveries',
    'operations_payment_events',
    'operations_automation_events'
  ) AND old_status IN ('sent', 'completed') THEN
    RAISE EXCEPTION 'Sent or completed operations records are immutable: %', TG_TABLE_NAME;
  END IF;

  IF TG_TABLE_NAME = 'operations_invoices'
    AND old_status IN ('sent', 'partially_paid', 'paid', 'overdue')
    AND (
      (to_jsonb(NEW) - ARRAY['status', 'paid_amount', 'paid_at', 'updated_at'])
      IS DISTINCT FROM
      (to_jsonb(OLD) - ARRAY['status', 'paid_amount', 'paid_at', 'updated_at'])
    ) THEN
    RAISE EXCEPTION 'Sent invoice details are immutable';
  END IF;

  IF TG_TABLE_NAME = 'operations_invoices'
    AND old_status IN ('sent', 'partially_paid', 'paid', 'overdue')
    AND new_status NOT IN ('sent', 'partially_paid', 'paid', 'overdue', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid immutable invoice transition';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION operations_guard_immutable_state() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION operations_guard_immutable_state() TO authenticated, service_role;

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'operations_trusts',
    'operations_trust_settings',
    'operations_people',
    'operations_trust_people',
    'operations_transactions',
    'operations_journal_entries',
    'operations_journal_lines',
    'operations_approval_requests',
    'operations_approval_actions',
    'operations_audit_events',
    'operations_funds',
    'operations_fund_budgets',
    'operations_fund_allocations',
    'operations_fund_commitments',
    'operations_fund_transfers',
    'operations_payment_events',
    'operations_donations',
    'operations_donation_allocations',
    'operations_invoices',
    'operations_invoice_lines',
    'operations_receipts',
    'operations_document_deliveries',
    'operations_document_templates',
    'operations_number_sequences',
    'operations_employees',
    'operations_salary_structures',
    'operations_salary_components',
    'operations_payroll_periods',
    'operations_payroll_runs',
    'operations_payroll_lines',
    'operations_payroll_adjustments',
    'operations_payslips',
    'operations_payroll_payments',
    'operations_automation_events'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
  END LOOP;
END
$$;

DO $$
DECLARE
  table_name TEXT;
  policy_name TEXT;
  write_condition TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'operations_people',
    'operations_trust_people',
    'operations_transactions',
    'operations_journal_entries',
    'operations_journal_lines',
    'operations_funds',
    'operations_fund_budgets',
    'operations_fund_allocations',
    'operations_fund_commitments',
    'operations_fund_transfers',
    'operations_payment_events',
    'operations_donations',
    'operations_donation_allocations',
    'operations_invoices',
    'operations_invoice_lines',
    'operations_receipts',
    'operations_document_deliveries',
    'operations_document_templates',
    'operations_employees',
    'operations_salary_structures',
    'operations_salary_components',
    'operations_payroll_periods',
    'operations_payroll_runs',
    'operations_payroll_lines',
    'operations_payroll_adjustments',
    'operations_payslips',
    'operations_payroll_payments',
    'operations_automation_events'
  ] LOOP
    policy_name := 'operations_read_' || table_name;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = table_name AND policyname = policy_name
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (operations_current_role_is(ARRAY[''admin'', ''accountant'', ''viewer'']))',
        policy_name, table_name
      );
    END IF;

    IF table_name IN (
      'operations_transactions',
      'operations_journal_entries',
      'operations_fund_allocations',
      'operations_fund_commitments',
      'operations_fund_transfers',
      'operations_payment_events',
      'operations_donations',
      'operations_invoices',
      'operations_document_deliveries',
      'operations_receipts',
      'operations_payroll_runs',
      'operations_payroll_lines',
      'operations_payslips',
      'operations_payroll_payments',
      'operations_automation_events'
    ) THEN
      write_condition := 'operations_current_role_is(ARRAY[''admin'']) OR (operations_current_role_is(ARRAY[''accountant'']) AND status NOT IN (''approved'', ''verified'', ''posted'', ''reversed'', ''sent'', ''completed'', ''paid'', ''issued'', ''committed'', ''fulfilled'', ''cancelled''))';
    ELSE
      write_condition := 'operations_current_role_is(ARRAY[''admin'', ''accountant''])';
    END IF;

    policy_name := 'operations_write_' || table_name;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = table_name AND policyname = policy_name
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR ALL TO authenticated USING (operations_current_role_is(ARRAY[''admin'', ''accountant''])) WITH CHECK (%s)',
        policy_name, table_name, write_condition
      );
    END IF;
  END LOOP;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'operations_approval_requests'
      AND policyname = 'operations_read_operations_approval_requests'
  ) THEN
    CREATE POLICY operations_read_operations_approval_requests
      ON operations_approval_requests
      FOR SELECT TO authenticated
      USING (operations_current_role_is(ARRAY['admin', 'accountant', 'viewer']));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'operations_approval_requests'
      AND policyname = 'operations_submit_operations_approval_requests'
  ) THEN
    CREATE POLICY operations_submit_operations_approval_requests
      ON operations_approval_requests
      FOR INSERT TO authenticated
      WITH CHECK (
        operations_current_role_is(ARRAY['admin', 'accountant'])
        AND status = 'pending_approval'
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'operations_approval_requests'
      AND policyname = 'operations_admin_review_operations_approval_requests'
  ) THEN
    CREATE POLICY operations_admin_review_operations_approval_requests
      ON operations_approval_requests
      FOR UPDATE TO authenticated
      USING (operations_current_role_is(ARRAY['admin']))
      WITH CHECK (operations_current_role_is(ARRAY['admin']));
  END IF;
END
$$;

DO $$
DECLARE
  table_name TEXT;
  policy_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'operations_trusts',
    'operations_trust_settings'
  ] LOOP
    policy_name := 'operations_read_' || table_name;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = table_name AND policyname = policy_name
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (operations_current_role_is(ARRAY[''admin'', ''accountant'', ''viewer'']))',
        policy_name, table_name
      );
    END IF;

    policy_name := 'operations_admin_write_' || table_name;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = table_name AND policyname = policy_name
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR ALL TO authenticated USING (operations_current_role_is(ARRAY[''admin''])) WITH CHECK (operations_current_role_is(ARRAY[''admin'']))',
        policy_name, table_name
      );
    END IF;
  END LOOP;
END
$$;

DO $$
DECLARE
  table_name TEXT;
  policy_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'operations_approval_actions',
    'operations_number_sequences'
  ] LOOP
    policy_name := 'operations_read_' || table_name;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = table_name AND policyname = policy_name
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (operations_current_role_is(ARRAY[''admin'', ''accountant'', ''viewer'']))',
        policy_name, table_name
      );
    END IF;
  END LOOP;

  policy_name := 'operations_admin_write_operations_approval_actions';
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'operations_approval_actions' AND policyname = policy_name
  ) THEN
    EXECUTE format(
      'CREATE POLICY %I ON operations_approval_actions FOR INSERT TO authenticated WITH CHECK (operations_current_role_is(ARRAY[''admin'']))',
      policy_name
    );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'operations_audit_events'
      AND policyname = 'operations_read_operations_audit_events'
  ) THEN
    CREATE POLICY operations_read_operations_audit_events
      ON operations_audit_events
      FOR SELECT TO authenticated
      USING (operations_current_role_is(ARRAY['admin', 'accountant', 'viewer']));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'operations_audit_events'
      AND policyname = 'operations_append_operations_audit_events'
  ) THEN
    CREATE POLICY operations_append_operations_audit_events
      ON operations_audit_events
      FOR INSERT TO authenticated
      WITH CHECK (operations_current_role_is(ARRAY['admin', 'accountant']));
  END IF;
END
$$;

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'operations_journal_entries',
    'operations_journal_lines',
    'operations_transactions',
    'operations_donations',
    'operations_fund_allocations',
    'operations_fund_commitments',
    'operations_fund_transfers',
    'operations_receipts',
    'operations_document_deliveries',
    'operations_payment_events',
    'operations_invoices',
    'operations_invoice_lines',
    'operations_payroll_runs',
    'operations_payroll_lines',
    'operations_payslips',
    'operations_payroll_payments',
    'operations_automation_events'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_trigger
      WHERE tgname = 'operations_immutable_state_guard'
        AND tgrelid = to_regclass(table_name)
    ) THEN
      EXECUTE format(
        'CREATE TRIGGER operations_immutable_state_guard BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION operations_guard_immutable_state()',
        table_name
      );
    END IF;
  END LOOP;
END
$$;

INSERT INTO public.schema_migrations (version)
VALUES ('017')
ON CONFLICT (version) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Migration 018_operations_sequences.sql
-- -----------------------------------------------------------------------------
-- Atomic, trust/year-scoped document number allocation.

-- Keep generated document identifiers and donation delivery records unique even
-- when more than one worker processes the same donation concurrently.
CREATE UNIQUE INDEX IF NOT EXISTS operations_receipts_donation_uidx
  ON operations_receipts (donation_id);

CREATE UNIQUE INDEX IF NOT EXISTS operations_receipts_number_uidx
  ON operations_receipts (trust_id, receipt_number)
  WHERE receipt_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS operations_invoices_transaction_uidx
  ON operations_invoices (transaction_id)
  WHERE transaction_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS operations_invoices_number_uidx
  ON operations_invoices (trust_id, invoice_number)
  WHERE invoice_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS operations_donation_invoices_uidx
  ON operations_invoices (trust_id, ((metadata ->> 'donation_id')))
  WHERE metadata ->> 'document_type' = 'donation_invoice'
    AND metadata ->> 'donation_id' IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS operations_combined_document_deliveries_uidx
  ON operations_document_deliveries (receipt_id, invoice_id, delivery_type)
  WHERE delivery_type = 'combined'
    AND receipt_id IS NOT NULL
    AND invoice_id IS NOT NULL;

CREATE OR REPLACE FUNCTION operations_next_number(
  p_trust_id UUID,
  p_document_type TEXT,
  p_financial_year TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_value BIGINT;
  number_prefix TEXT;
BEGIN
  IF p_trust_id IS NULL THEN
    RAISE EXCEPTION 'Trust is required for document numbering';
  END IF;

  IF p_document_type IS NULL OR p_document_type !~ '^[a-z][a-z0-9_]{1,31}$' THEN
    RAISE EXCEPTION 'Document type must be a lowercase identifier';
  END IF;

  IF p_financial_year IS NULL OR p_financial_year !~ '^[0-9]{4}(-[0-9]{2,4})?$' THEN
    RAISE EXCEPTION 'Financial year must use YYYY or YYYY-YY format';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM operations_trusts WHERE id = p_trust_id AND is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'Active trust not found for document numbering';
  END IF;

  INSERT INTO operations_number_sequences (trust_id, document_type, financial_year, next_value)
  VALUES (p_trust_id, p_document_type, p_financial_year, 1)
  ON CONFLICT (trust_id, document_type, financial_year) DO NOTHING;

  SELECT s.next_value
  INTO next_value
  FROM operations_number_sequences AS s
  WHERE s.trust_id = p_trust_id
    AND s.document_type = p_document_type
    AND s.financial_year = p_financial_year
  FOR UPDATE;

  IF next_value IS NULL THEN
    RAISE EXCEPTION 'Unable to lock document number sequence';
  END IF;

  IF next_value = 9223372036854775807::BIGINT THEN
    RAISE EXCEPTION 'Document number sequence is exhausted';
  END IF;

  UPDATE operations_number_sequences
  SET next_value = next_value + 1,
      updated_at = NOW()
  WHERE trust_id = p_trust_id
    AND document_type = p_document_type
    AND financial_year = p_financial_year;

  number_prefix := CASE p_document_type
    WHEN 'receipt' THEN 'RCT'
    WHEN 'invoice' THEN 'INV'
    WHEN 'payslip' THEN 'PAY'
    WHEN 'journal' THEN 'JE'
    ELSE UPPER(REGEXP_REPLACE(p_document_type, '[^a-zA-Z0-9]+', '', 'g'))
  END;

  RETURN number_prefix || '-' || p_financial_year || '-' || LPAD(next_value::TEXT, 6, '0');
END;
$$;

REVOKE ALL ON FUNCTION operations_next_number(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION operations_next_number(UUID, TEXT, TEXT) TO service_role;

INSERT INTO public.schema_migrations (version)
VALUES ('018')
ON CONFLICT (version) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Migration 019_operations_posting.sql
-- -----------------------------------------------------------------------------
-- Additive approval state machine and atomic Operations posting boundary.
-- No existing CRM table, column, route, or record is modified by this migration.

CREATE TABLE IF NOT EXISTS operations_transaction_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trust_id UUID NOT NULL REFERENCES operations_trusts(id) ON DELETE RESTRICT,
  transaction_id UUID NOT NULL UNIQUE REFERENCES operations_transactions(id) ON DELETE RESTRICT,
  account_id UUID NOT NULL REFERENCES chart_of_accounts(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS operations_transaction_accounts_filter_idx
  ON operations_transaction_accounts (trust_id, transaction_id, account_id);

ALTER TABLE operations_transaction_accounts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'operations_transaction_accounts'
      AND policyname = 'operations_read_operations_transaction_accounts'
  ) THEN
    CREATE POLICY operations_read_operations_transaction_accounts
      ON operations_transaction_accounts
      FOR SELECT TO authenticated
      USING (operations_current_role_is(ARRAY['admin', 'accountant', 'viewer']));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'operations_transaction_accounts'
      AND policyname = 'operations_write_operations_transaction_accounts'
  ) THEN
    CREATE POLICY operations_write_operations_transaction_accounts
      ON operations_transaction_accounts
      FOR ALL TO authenticated
      USING (operations_current_role_is(ARRAY['admin', 'accountant']))
      WITH CHECK (operations_current_role_is(ARRAY['admin', 'accountant']));
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS operations_approval_pending_record_uidx
  ON operations_approval_requests (record_id)
  WHERE status = 'pending_approval';

CREATE OR REPLACE FUNCTION operations_actor_has_role(p_actor_id UUID, p_roles TEXT[])
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM profiles
    WHERE id = p_actor_id
      AND role::TEXT = ANY (p_roles)
  );
$$;

REVOKE ALL ON FUNCTION operations_actor_has_role(UUID, TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION operations_actor_has_role(UUID, TEXT[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION operations_create_draft(
  p_actor_id UUID,
  p_trust_id UUID,
  p_type TEXT,
  p_amount NUMERIC,
  p_currency TEXT,
  p_account_id UUID,
  p_fund_id UUID DEFAULT NULL,
  p_party_id UUID DEFAULT NULL,
  p_source TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::JSONB,
  p_request_id TEXT DEFAULT NULL,
  p_request_ip INET DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transaction operations_transactions%ROWTYPE;
BEGIN
  IF NOT operations_actor_has_role(p_actor_id, ARRAY['admin', 'accountant']) THEN
    RAISE EXCEPTION 'Only Admin or Accountant can create financial drafts' USING ERRCODE = '42501';
  END IF;

  IF p_trust_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM operations_trusts WHERE id = p_trust_id AND is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'Active trust is required';
  END IF;
  IF p_type NOT IN ('debit', 'credit') THEN
    RAISE EXCEPTION 'Financial draft type must be debit or credit';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Financial draft amount must be positive';
  END IF;
  IF p_currency IS NULL OR p_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'Currency must be an uppercase three-letter code';
  END IF;
  IF p_account_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM chart_of_accounts WHERE id = p_account_id AND is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'Active account is required';
  END IF;
  IF p_party_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM operations_people WHERE id = p_party_id
  ) THEN
    RAISE EXCEPTION 'Party was not found';
  END IF;
  IF p_fund_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM operations_funds
    WHERE id = p_fund_id AND trust_id = p_trust_id AND status <> 'closed'
  ) THEN
    RAISE EXCEPTION 'Fund does not belong to the selected trust';
  END IF;

  INSERT INTO operations_transactions (
    trust_id,
    person_id,
    fund_id,
    transaction_type,
    status,
    amount,
    currency,
    description,
    source_type,
    created_by,
    updated_by,
    metadata
  )
  VALUES (
    p_trust_id,
    p_party_id,
    p_fund_id,
    p_type,
    'draft',
    p_amount,
    p_currency,
    COALESCE(NULLIF(p_source, ''), 'Manual Operations record'),
    p_source,
    p_actor_id,
    p_actor_id,
    COALESCE(p_metadata, '{}'::JSONB)
  )
  RETURNING * INTO v_transaction;

  INSERT INTO operations_transaction_accounts (trust_id, transaction_id, account_id)
  VALUES (p_trust_id, v_transaction.id, p_account_id);

  INSERT INTO operations_audit_events (
    trust_id, entity_type, entity_id, action, actor_id, request_id, request_ip, metadata
  )
  VALUES (
    p_trust_id,
    'operations_transaction',
    v_transaction.id,
    'create_draft',
    p_actor_id,
    p_request_id,
    p_request_ip,
    jsonb_build_object('type', p_type, 'amount', p_amount, 'currency', p_currency)
  );

  RETURN jsonb_build_object(
    'id', v_transaction.id,
    'transactionId', v_transaction.id,
    'status', v_transaction.status
  );
END;
$$;

REVOKE ALL ON FUNCTION operations_create_draft(UUID, UUID, TEXT, NUMERIC, TEXT, UUID, UUID, UUID, TEXT, JSONB, TEXT, INET) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION operations_create_draft(UUID, UUID, TEXT, NUMERIC, TEXT, UUID, UUID, UUID, TEXT, JSONB, TEXT, INET) TO service_role;

CREATE OR REPLACE FUNCTION operations_submit_for_approval(
  p_actor_id UUID,
  p_record_id UUID,
  p_request_id TEXT DEFAULT NULL,
  p_request_ip INET DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transaction operations_transactions%ROWTYPE;
  v_approval operations_approval_requests%ROWTYPE;
BEGIN
  IF NOT operations_actor_has_role(p_actor_id, ARRAY['admin', 'accountant']) THEN
    RAISE EXCEPTION 'Only Admin or Accountant can submit records for approval' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_transaction
  FROM operations_transactions
  WHERE id = p_record_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Financial record was not found';
  END IF;
  IF v_transaction.status <> 'draft' THEN
    RAISE EXCEPTION 'Only draft records can be submitted for approval';
  END IF;

  INSERT INTO operations_approval_requests (
    trust_id, record_type, record_id, transaction_id, status, requested_by
  )
  VALUES (
    v_transaction.trust_id,
    'operations_transaction',
    v_transaction.id,
    v_transaction.id,
    'pending_approval',
    p_actor_id
  )
  RETURNING * INTO v_approval;

  INSERT INTO operations_approval_actions (
    trust_id, approval_request_id, action, actor_id, comment
  )
  VALUES (
    v_transaction.trust_id, v_approval.id, 'submit', p_actor_id, NULL
  );

  UPDATE operations_transactions
  SET status = 'pending_approval', updated_by = p_actor_id, updated_at = NOW()
  WHERE id = v_transaction.id;

  INSERT INTO operations_audit_events (
    trust_id, entity_type, entity_id, action, actor_id, request_id, request_ip
  )
  VALUES (
    v_transaction.trust_id,
    'operations_transaction',
    v_transaction.id,
    'submit_for_approval',
    p_actor_id,
    p_request_id,
    p_request_ip
  );

  RETURN jsonb_build_object(
    'id', v_approval.id,
    'approvalId', v_approval.id,
    'recordId', v_transaction.id,
    'transactionId', v_transaction.id,
    'status', v_approval.status
  );
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'A pending approval already exists for this record';
END;
$$;

REVOKE ALL ON FUNCTION operations_submit_for_approval(UUID, UUID, TEXT, INET) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION operations_submit_for_approval(UUID, UUID, TEXT, INET) TO service_role;

CREATE OR REPLACE FUNCTION operations_approve_and_post(
  p_actor_id UUID,
  p_approval_id UUID,
  p_request_id TEXT DEFAULT NULL,
  p_request_ip INET DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_approval operations_approval_requests%ROWTYPE;
  v_transaction operations_transactions%ROWTYPE;
  v_account_id UUID;
  v_entry_id UUID;
  v_entry_number TEXT;
  v_fund_allocation_id UUID;
BEGIN
  IF NOT operations_actor_has_role(p_actor_id, ARRAY['admin']) THEN
    RAISE EXCEPTION 'Only Admin can approve and post records' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_approval
  FROM operations_approval_requests
  WHERE id = p_approval_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approval request was not found';
  END IF;
  IF v_approval.status <> 'pending_approval' THEN
    RAISE EXCEPTION 'Only pending approvals can be approved';
  END IF;

  SELECT * INTO v_transaction
  FROM operations_transactions
  WHERE id = v_approval.transaction_id
  FOR UPDATE;

  IF NOT FOUND OR v_transaction.status <> 'pending_approval' THEN
    RAISE EXCEPTION 'Only pending financial records can be posted';
  END IF;

  SELECT account_id INTO v_account_id
  FROM operations_transaction_accounts
  WHERE transaction_id = v_transaction.id
    AND trust_id = v_transaction.trust_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Financial record account was not found';
  END IF;

  v_entry_number := operations_next_number(
    v_transaction.trust_id,
    'journal',
    TO_CHAR(CURRENT_DATE, 'YYYY')
  );

  INSERT INTO operations_journal_entries (
    trust_id,
    transaction_id,
    entry_number,
    entry_date,
    description,
    reference,
    status,
    currency,
    total_debit,
    total_credit,
    created_by,
    posted_by,
    posted_at
  )
  VALUES (
    v_transaction.trust_id,
    v_transaction.id,
    v_entry_number,
    CURRENT_DATE,
    COALESCE(v_transaction.description, 'Operations posting'),
    'OPERATIONS:' || v_transaction.id::TEXT,
    'posted',
    v_transaction.currency,
    v_transaction.amount,
    v_transaction.amount,
    v_transaction.created_by,
    p_actor_id,
    NOW()
  )
  RETURNING id INTO v_entry_id;

  IF v_transaction.transaction_type = 'debit' THEN
    INSERT INTO operations_journal_lines (
      trust_id, journal_entry_id, line_number, account_code, description, debit, credit, currency
    )
    VALUES
      (v_transaction.trust_id, v_entry_id, 1, v_account_id::TEXT, 'Operations debit', v_transaction.amount, 0, v_transaction.currency),
      (v_transaction.trust_id, v_entry_id, 2, 'OPERATIONS_OFFSET', 'Operations balancing line', 0, v_transaction.amount, v_transaction.currency);
  ELSE
    INSERT INTO operations_journal_lines (
      trust_id, journal_entry_id, line_number, account_code, description, debit, credit, currency
    )
    VALUES
      (v_transaction.trust_id, v_entry_id, 1, 'OPERATIONS_OFFSET', 'Operations balancing line', v_transaction.amount, 0, v_transaction.currency),
      (v_transaction.trust_id, v_entry_id, 2, v_account_id::TEXT, 'Operations credit', 0, v_transaction.amount, v_transaction.currency);
  END IF;

  IF v_transaction.fund_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM operations_funds
      WHERE id = v_transaction.fund_id
        AND trust_id = v_transaction.trust_id
        AND status <> 'closed'
    ) THEN
      RAISE EXCEPTION 'Fund does not belong to the selected trust';
    END IF;

    INSERT INTO operations_fund_allocations (
      trust_id, fund_id, transaction_id, allocation_type, status, amount, currency, created_by
    )
    VALUES (
      v_transaction.trust_id,
      v_transaction.fund_id,
      v_transaction.id,
      'other',
      'posted',
      v_transaction.amount,
      v_transaction.currency,
      p_actor_id
    )
    RETURNING id INTO v_fund_allocation_id;
  END IF;

  INSERT INTO operations_approval_actions (
    trust_id, approval_request_id, action, actor_id, comment
  )
  VALUES
    (v_transaction.trust_id, v_approval.id, 'approve', p_actor_id, NULL),
    (v_transaction.trust_id, v_approval.id, 'post', p_actor_id, NULL);

  UPDATE operations_approval_requests
  SET status = 'approved', reviewed_by = p_actor_id, reviewed_at = NOW(), updated_at = NOW()
  WHERE id = v_approval.id;

  UPDATE operations_transactions
  SET status = 'posted', approved_by = p_actor_id, posted_at = NOW(), updated_by = p_actor_id, updated_at = NOW()
  WHERE id = v_transaction.id;

  INSERT INTO operations_audit_events (
    trust_id, entity_type, entity_id, action, actor_id, request_id, request_ip, metadata
  )
  VALUES (
    v_transaction.trust_id,
    'operations_transaction',
    v_transaction.id,
    'approve_and_post',
    p_actor_id,
    p_request_id,
    p_request_ip,
    jsonb_build_object('approval_id', v_approval.id, 'journal_entry_id', v_entry_id)
  );

  RETURN jsonb_build_object(
    'transactionId', v_transaction.id,
    'journalEntryId', v_entry_id,
    'fundAllocationId', v_fund_allocation_id
  );
END;
$$;

REVOKE ALL ON FUNCTION operations_approve_and_post(UUID, UUID, TEXT, INET) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION operations_approve_and_post(UUID, UUID, TEXT, INET) TO service_role;

CREATE OR REPLACE FUNCTION operations_reject_approval(
  p_actor_id UUID,
  p_approval_id UUID,
  p_reason TEXT,
  p_request_id TEXT DEFAULT NULL,
  p_request_ip INET DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_approval operations_approval_requests%ROWTYPE;
  v_transaction operations_transactions%ROWTYPE;
BEGIN
  IF NOT operations_actor_has_role(p_actor_id, ARRAY['admin']) THEN
    RAISE EXCEPTION 'Only Admin can reject approvals' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR LENGTH(BTRIM(p_reason)) = 0 THEN
    RAISE EXCEPTION 'A rejection reason is required';
  END IF;

  SELECT * INTO v_approval
  FROM operations_approval_requests
  WHERE id = p_approval_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approval request was not found';
  END IF;
  IF v_approval.status <> 'pending_approval' THEN
    RAISE EXCEPTION 'Only pending approvals can be rejected';
  END IF;

  SELECT * INTO v_transaction
  FROM operations_transactions
  WHERE id = v_approval.transaction_id
  FOR UPDATE;

  IF NOT FOUND OR v_transaction.status <> 'pending_approval' THEN
    RAISE EXCEPTION 'Only pending financial records can be rejected';
  END IF;

  INSERT INTO operations_approval_actions (
    trust_id, approval_request_id, action, actor_id, comment
  )
  VALUES (v_transaction.trust_id, v_approval.id, 'reject', p_actor_id, BTRIM(p_reason));

  UPDATE operations_approval_requests
  SET status = 'rejected', reviewed_by = p_actor_id, reviewed_at = NOW(), reason = BTRIM(p_reason), updated_at = NOW()
  WHERE id = v_approval.id;

  UPDATE operations_transactions
  SET status = 'rejected', updated_by = p_actor_id, updated_at = NOW()
  WHERE id = v_transaction.id;

  INSERT INTO operations_audit_events (
    trust_id, entity_type, entity_id, action, actor_id, request_id, request_ip, reason
  )
  VALUES (
    v_transaction.trust_id,
    'operations_transaction',
    v_transaction.id,
    'reject_approval',
    p_actor_id,
    p_request_id,
    p_request_ip,
    BTRIM(p_reason)
  );

  RETURN jsonb_build_object(
    'id', v_approval.id,
    'approvalId', v_approval.id,
    'recordId', v_transaction.id,
    'transactionId', v_transaction.id,
    'status', 'rejected',
    'reason', BTRIM(p_reason)
  );
END;
$$;

REVOKE ALL ON FUNCTION operations_reject_approval(UUID, UUID, TEXT, TEXT, INET) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION operations_reject_approval(UUID, UUID, TEXT, TEXT, INET) TO service_role;

-- Permit only the state marker on a transaction when an immutable posted record
-- is reversed. The posted journal and its lines remain fully immutable.
CREATE OR REPLACE FUNCTION operations_guard_immutable_state()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_status TEXT := to_jsonb(OLD)->>'status';
  new_status TEXT := to_jsonb(NEW)->>'status';
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF old_status IN ('posted', 'sent', 'completed')
      OR (TG_TABLE_NAME = 'operations_journal_entries'
        AND COALESCE((to_jsonb(OLD)->>'is_posted')::BOOLEAN, FALSE)) THEN
      RAISE EXCEPTION 'Immutable operations record cannot be deleted: %', TG_TABLE_NAME;
    END IF;
    RETURN OLD;
  END IF;

  IF TG_TABLE_NAME = 'operations_transactions'
    AND old_status = 'posted'
    AND new_status = 'reversed' THEN
    IF (to_jsonb(NEW) - ARRAY['status', 'updated_at', 'updated_by', 'metadata'])
      IS DISTINCT FROM
      (to_jsonb(OLD) - ARRAY['status', 'updated_at', 'updated_by', 'metadata']) THEN
      RAISE EXCEPTION 'Only reversal state may change on a posted transaction';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'operations_journal_entries' AND old_status = 'posted' THEN
    RAISE EXCEPTION 'Posted journal entries are immutable';
  END IF;

  IF TG_TABLE_NAME = 'operations_journal_lines'
    AND EXISTS (
      SELECT 1
      FROM operations_journal_entries
      WHERE id = OLD.journal_entry_id AND status = 'posted'
    ) THEN
    RAISE EXCEPTION 'Lines belonging to a posted journal entry are immutable';
  END IF;

  IF TG_TABLE_NAME = 'operations_invoice_lines'
    AND EXISTS (
      SELECT 1
      FROM operations_invoices
      WHERE id = OLD.invoice_id AND status IN ('sent', 'partially_paid', 'paid', 'overdue')
    ) THEN
    RAISE EXCEPTION 'Lines belonging to a sent invoice are immutable';
  END IF;

  IF old_status IN ('posted', 'reversed') THEN
    RAISE EXCEPTION 'Posted or reversed operations records are immutable: %', TG_TABLE_NAME;
  END IF;

  IF TG_TABLE_NAME IN (
    'operations_receipts',
    'operations_payslips',
    'operations_document_deliveries',
    'operations_payment_events',
    'operations_automation_events'
  ) AND old_status IN ('sent', 'completed') THEN
    RAISE EXCEPTION 'Sent or completed operations records are immutable: %', TG_TABLE_NAME;
  END IF;

  IF TG_TABLE_NAME = 'operations_invoices'
    AND old_status IN ('sent', 'partially_paid', 'paid', 'overdue')
    AND (
      (to_jsonb(NEW) - ARRAY['status', 'paid_amount', 'paid_at', 'updated_at'])
      IS DISTINCT FROM
      (to_jsonb(OLD) - ARRAY['status', 'paid_amount', 'paid_at', 'updated_at'])
    ) THEN
    RAISE EXCEPTION 'Sent invoice details are immutable';
  END IF;

  IF TG_TABLE_NAME = 'operations_invoices'
    AND old_status IN ('sent', 'partially_paid', 'paid', 'overdue')
    AND new_status NOT IN ('sent', 'partially_paid', 'paid', 'overdue', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid immutable invoice transition';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION operations_guard_immutable_state() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION operations_guard_immutable_state() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION operations_reverse_posted_record(
  p_actor_id UUID,
  p_record_id UUID,
  p_reason TEXT,
  p_request_id TEXT DEFAULT NULL,
  p_request_ip INET DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_original operations_transactions%ROWTYPE;
  v_account_id UUID;
  v_reversal operations_transactions%ROWTYPE;
  v_entry_id UUID;
  v_entry_number TEXT;
  v_fund_allocation_id UUID;
BEGIN
  IF NOT operations_actor_has_role(p_actor_id, ARRAY['admin']) THEN
    RAISE EXCEPTION 'Only Admin can reverse posted records' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR LENGTH(BTRIM(p_reason)) = 0 THEN
    RAISE EXCEPTION 'A reversal reason is required';
  END IF;

  SELECT * INTO v_original
  FROM operations_transactions
  WHERE id = p_record_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Posted financial record was not found';
  END IF;
  IF v_original.status <> 'posted' THEN
    RAISE EXCEPTION 'Only posted records can be reversed';
  END IF;

  SELECT account_id INTO v_account_id
  FROM operations_transaction_accounts
  WHERE transaction_id = v_original.id
    AND trust_id = v_original.trust_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Posted financial record account was not found';
  END IF;

  INSERT INTO operations_transactions (
    trust_id,
    person_id,
    fund_id,
    transaction_type,
    status,
    amount,
    currency,
    description,
    source_type,
    source_id,
    approved_by,
    posted_at,
    created_by,
    updated_by,
    metadata
  )
  VALUES (
    v_original.trust_id,
    v_original.person_id,
    v_original.fund_id,
    CASE WHEN v_original.transaction_type = 'debit' THEN 'credit' ELSE 'debit' END,
    'posted',
    v_original.amount,
    v_original.currency,
    'Reversal of ' || v_original.id::TEXT,
    'reversal',
    v_original.id,
    p_actor_id,
    NOW(),
    p_actor_id,
    p_actor_id,
    COALESCE(v_original.metadata, '{}'::JSONB) || jsonb_build_object(
      'reverses_record_id', v_original.id,
      'reversal_reason', BTRIM(p_reason)
    )
  )
  RETURNING * INTO v_reversal;

  INSERT INTO operations_transaction_accounts (trust_id, transaction_id, account_id)
  VALUES (v_reversal.trust_id, v_reversal.id, v_account_id);

  v_entry_number := operations_next_number(
    v_reversal.trust_id,
    'journal',
    TO_CHAR(CURRENT_DATE, 'YYYY')
  );

  INSERT INTO operations_journal_entries (
    trust_id,
    transaction_id,
    entry_number,
    entry_date,
    description,
    reference,
    status,
    currency,
    total_debit,
    total_credit,
    created_by,
    posted_by,
    posted_at
  )
  VALUES (
    v_reversal.trust_id,
    v_reversal.id,
    v_entry_number,
    CURRENT_DATE,
    v_reversal.description,
    'REVERSAL:' || v_original.id::TEXT,
    'posted',
    v_reversal.currency,
    v_reversal.amount,
    v_reversal.amount,
    p_actor_id,
    p_actor_id,
    NOW()
  )
  RETURNING id INTO v_entry_id;

  IF v_reversal.transaction_type = 'debit' THEN
    INSERT INTO operations_journal_lines (
      trust_id, journal_entry_id, line_number, account_code, description, debit, credit, currency
    )
    VALUES
      (v_reversal.trust_id, v_entry_id, 1, v_account_id::TEXT, 'Reversal debit', v_reversal.amount, 0, v_reversal.currency),
      (v_reversal.trust_id, v_entry_id, 2, 'OPERATIONS_OFFSET', 'Reversal balancing line', 0, v_reversal.amount, v_reversal.currency);
  ELSE
    INSERT INTO operations_journal_lines (
      trust_id, journal_entry_id, line_number, account_code, description, debit, credit, currency
    )
    VALUES
      (v_reversal.trust_id, v_entry_id, 1, 'OPERATIONS_OFFSET', 'Reversal balancing line', v_reversal.amount, 0, v_reversal.currency),
      (v_reversal.trust_id, v_entry_id, 2, v_account_id::TEXT, 'Reversal credit', 0, v_reversal.amount, v_reversal.currency);
  END IF;

  IF v_original.fund_id IS NOT NULL THEN
    INSERT INTO operations_fund_allocations (
      trust_id, fund_id, transaction_id, allocation_type, status, amount, currency, created_by
    )
    VALUES (
      v_original.trust_id,
      v_original.fund_id,
      v_reversal.id,
      'other',
      'reversed',
      v_original.amount,
      v_original.currency,
      p_actor_id
    )
    RETURNING id INTO v_fund_allocation_id;
  END IF;

  UPDATE operations_transactions
  SET status = 'reversed',
      updated_by = p_actor_id,
      updated_at = NOW(),
      metadata = COALESCE(metadata, '{}'::JSONB) || jsonb_build_object(
        'reversed_by_transaction_id', v_reversal.id,
        'reversal_reason', BTRIM(p_reason)
      )
  WHERE id = v_original.id;

  INSERT INTO operations_audit_events (
    trust_id, entity_type, entity_id, action, actor_id, request_id, request_ip, reason, metadata
  )
  VALUES
    (
      v_original.trust_id,
      'operations_transaction',
      v_original.id,
      'reverse',
      p_actor_id,
      p_request_id,
      p_request_ip,
      BTRIM(p_reason),
      jsonb_build_object('reversal_transaction_id', v_reversal.id, 'original_journal_untouched', TRUE)
    ),
    (
      v_reversal.trust_id,
      'operations_transaction',
      v_reversal.id,
      'post_reversal',
      p_actor_id,
      p_request_id,
      p_request_ip,
      BTRIM(p_reason),
      jsonb_build_object('reverses_record_id', v_original.id, 'journal_entry_id', v_entry_id)
    );

  RETURN jsonb_build_object(
    'transactionId', v_reversal.id,
    'reversalTransactionId', v_reversal.id,
    'journalEntryId', v_entry_id,
    'fundAllocationId', v_fund_allocation_id,
    'reversedRecordId', v_original.id,
    'status', 'posted'
  );
END;
$$;

REVOKE ALL ON FUNCTION operations_reverse_posted_record(UUID, UUID, TEXT, TEXT, INET) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION operations_reverse_posted_record(UUID, UUID, TEXT, TEXT, INET) TO service_role;

INSERT INTO public.schema_migrations (version)
VALUES ('019')
ON CONFLICT (version) DO NOTHING;

COMMIT;
