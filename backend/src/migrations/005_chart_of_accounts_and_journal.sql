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
