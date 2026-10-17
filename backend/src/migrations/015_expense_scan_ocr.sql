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
