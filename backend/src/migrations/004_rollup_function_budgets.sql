-- 12. Auto-rollup sub-category budgets to parent function

CREATE OR REPLACE FUNCTION rollup_function_budgets()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE functions f
    SET
      budget_total = COALESCE((
        SELECT SUM(fc.budget_amount) FROM function_categories fc WHERE fc.function_id = OLD.function_id
      ), 0),
      budget_cash = COALESCE((
        SELECT SUM(fc.budget_cash) FROM function_categories fc WHERE fc.function_id = OLD.function_id
      ), 0),
      budget_digital = COALESCE((
        SELECT SUM(fc.budget_digital) FROM function_categories fc WHERE fc.function_id = OLD.function_id
      ), 0)
    WHERE f.id = OLD.function_id;
    RETURN OLD;
  END IF;

  UPDATE functions f
  SET
    budget_total = COALESCE((
      SELECT SUM(fc.budget_amount) FROM function_categories fc WHERE fc.function_id = NEW.function_id
    ), 0),
    budget_cash = COALESCE((
      SELECT SUM(fc.budget_cash) FROM function_categories fc WHERE fc.function_id = NEW.function_id
    ), 0),
    budget_digital = COALESCE((
      SELECT SUM(fc.budget_digital) FROM function_categories fc WHERE fc.function_id = NEW.function_id
    ), 0)
  WHERE f.id = NEW.function_id;
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS rollup_function_budgets_trigger ON function_categories;
CREATE TRIGGER rollup_function_budgets_trigger
  AFTER INSERT OR UPDATE OR DELETE ON function_categories
  FOR EACH ROW EXECUTE FUNCTION rollup_function_budgets();
