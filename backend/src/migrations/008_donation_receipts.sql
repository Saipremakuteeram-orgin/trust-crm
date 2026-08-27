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
