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
