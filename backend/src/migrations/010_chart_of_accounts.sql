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

-- Account Balances (running balance per account)
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
