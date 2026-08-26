-- 11. Update views to include function_category_items totals

-- Update function category budget summary to include item totals
CREATE OR REPLACE VIEW v_function_category_budget AS
SELECT
  fc.id,
  fc.function_id,
  fc.category_id,
  c.name AS category_name,
  fc.budget_amount,
  fc.budget_cash,
  fc.budget_digital,
  COALESCE(SUM(CASE WHEN t.type = 'debit' AND t.mode = 'cash' THEN t.amount ELSE 0 END), 0) AS spent_cash,
  COALESCE(SUM(CASE WHEN t.type = 'debit' AND t.mode = 'digital' THEN t.amount ELSE 0 END), 0) AS spent_digital,
  COALESCE(SUM(CASE WHEN t.type = 'debit' THEN t.amount ELSE 0 END), 0) + COALESCE(i.item_total, 0) AS spent_total,
  (fc.budget_cash - COALESCE(SUM(CASE WHEN t.type = 'debit' AND t.mode = 'cash' THEN t.amount ELSE 0 END), 0)) AS remaining_cash,
  (fc.budget_digital - COALESCE(SUM(CASE WHEN t.type = 'debit' AND t.mode = 'digital' THEN t.amount ELSE 0 END), 0)) AS remaining_digital,
  (fc.budget_amount - (COALESCE(SUM(CASE WHEN t.type = 'debit' THEN t.amount ELSE 0 END), 0) + COALESCE(i.item_total, 0))) AS remaining_total
FROM function_categories fc
LEFT JOIN categories c ON c.id = fc.category_id
LEFT JOIN transactions t ON t.function_category_id = fc.id
LEFT JOIN (
  SELECT function_category_id, SUM(total_amount) AS item_total
  FROM function_category_items
  GROUP BY function_category_id
) i ON i.function_category_id = fc.id
GROUP BY fc.id, fc.function_id, fc.category_id, c.name, fc.budget_amount, fc.budget_cash, fc.budget_digital, i.item_total;

-- Update function budget summary to include item totals
CREATE OR REPLACE VIEW v_function_budget_summary AS
SELECT
  f.id,
  f.name,
  f.description,
  f.budget_total,
  f.budget_cash,
  f.budget_digital,
  f.status,
  f.created_by,
  f.created_at,
  f.updated_at,
  COALESCE(SUM(CASE WHEN t.type = 'debit' AND t.mode = 'cash' THEN t.amount ELSE 0 END), 0) AS spent_cash,
  COALESCE(SUM(CASE WHEN t.type = 'debit' AND t.mode = 'digital' THEN t.amount ELSE 0 END), 0) AS spent_digital,
  COALESCE(SUM(CASE WHEN t.type = 'debit' THEN t.amount ELSE 0 END), 0) + COALESCE(fi.item_total, 0) AS spent_total,
  COALESCE(SUM(CASE WHEN t.type = 'credit' AND t.mode = 'cash' THEN t.amount ELSE 0 END), 0) AS income_cash,
  COALESCE(SUM(CASE WHEN t.type = 'credit' AND t.mode = 'digital' THEN t.amount ELSE 0 END), 0) AS income_digital,
  (f.budget_cash - COALESCE(SUM(CASE WHEN t.type = 'debit' AND t.mode = 'cash' THEN t.amount ELSE 0 END), 0)) AS remaining_cash,
  (f.budget_digital - COALESCE(SUM(CASE WHEN t.type = 'debit' AND t.mode = 'digital' THEN t.amount ELSE 0 END), 0)) AS remaining_digital,
  (f.budget_total - (COALESCE(SUM(CASE WHEN t.type = 'debit' THEN t.amount ELSE 0 END), 0) + COALESCE(fi.item_total, 0))) AS remaining_total,
  CASE
    WHEN f.budget_cash > 0 AND COALESCE(SUM(CASE WHEN t.type = 'debit' AND t.mode = 'cash' THEN t.amount ELSE 0 END), 0) > f.budget_cash THEN true
    ELSE false
  END AS overspend_cash,
  CASE
    WHEN f.budget_digital > 0 AND COALESCE(SUM(CASE WHEN t.type = 'debit' AND t.mode = 'digital' THEN t.amount ELSE 0 END), 0) > f.budget_digital THEN false
    ELSE false
  END AS overspend_digital,
  CASE
    WHEN f.budget_total > 0 AND (COALESCE(SUM(CASE WHEN t.type = 'debit' THEN t.amount ELSE 0 END), 0) + COALESCE(fi.item_total, 0)) > f.budget_total THEN true
    ELSE false
  END AS overspend_total
FROM functions f
LEFT JOIN transactions t ON t.function_id = f.id
LEFT JOIN (
  SELECT fc.function_id, SUM(i.total_amount) AS item_total
  FROM function_category_items i
  JOIN function_categories fc ON fc.id = i.function_category_id
  GROUP BY fc.function_id
) fi ON fi.function_id = f.id
GROUP BY f.id, f.name, f.description, f.budget_total, f.budget_cash, f.budget_digital, f.status, f.created_by, f.created_at, f.updated_at, fi.item_total;
