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
