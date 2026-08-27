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
