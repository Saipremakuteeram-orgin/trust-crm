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
