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
