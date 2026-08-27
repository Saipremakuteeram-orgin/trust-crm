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
