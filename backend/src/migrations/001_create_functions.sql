-- Functions budget system migration
-- Run this in Supabase SQL Editor

-- 1. Create functions table
CREATE TABLE IF NOT EXISTS functions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  budget_total NUMERIC(15,2) NOT NULL DEFAULT 0,
  budget_cash NUMERIC(15,2) NOT NULL DEFAULT 0,
  budget_digital NUMERIC(15,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create function_categories table (optional category breakdown)
CREATE TABLE IF NOT EXISTS function_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  function_id UUID REFERENCES functions(id) ON DELETE CASCADE,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  budget_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  budget_cash NUMERIC(15,2) NOT NULL DEFAULT 0,
  budget_digital NUMERIC(15,2) NOT NULL DEFAULT 0,
  UNIQUE(function_id, category_id)
);

-- 3. Add function_id and function_category_id to transactions
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS function_id UUID REFERENCES functions(id) ON DELETE SET NULL;

ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS function_category_id UUID REFERENCES function_categories(id) ON DELETE SET NULL;

-- 4. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_transactions_function_id ON transactions(function_id);
CREATE INDEX IF NOT EXISTS idx_transactions_function_category_id ON transactions(function_category_id);
CREATE INDEX IF NOT EXISTS idx_functions_status ON functions(status);
CREATE INDEX IF NOT EXISTS idx_function_categories_function_id ON function_categories(function_id);

-- 5. Updated_at trigger for functions
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_functions_updated_at ON functions;
CREATE TRIGGER update_functions_updated_at
  BEFORE UPDATE ON functions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 6. View for function budget summary (computed spent/remaining)
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
  COALESCE(SUM(CASE WHEN t.type = 'debit' THEN t.amount ELSE 0 END), 0) AS spent_total,
  COALESCE(SUM(CASE WHEN t.type = 'credit' AND t.mode = 'cash' THEN t.amount ELSE 0 END), 0) AS income_cash,
  COALESCE(SUM(CASE WHEN t.type = 'credit' AND t.mode = 'digital' THEN t.amount ELSE 0 END), 0) AS income_digital,
  (f.budget_cash - COALESCE(SUM(CASE WHEN t.type = 'debit' AND t.mode = 'cash' THEN t.amount ELSE 0 END), 0)) AS remaining_cash,
  (f.budget_digital - COALESCE(SUM(CASE WHEN t.type = 'debit' AND t.mode = 'digital' THEN t.amount ELSE 0 END), 0)) AS remaining_digital,
  (f.budget_total - COALESCE(SUM(CASE WHEN t.type = 'debit' THEN t.amount ELSE 0 END), 0)) AS remaining_total,
  CASE 
    WHEN f.budget_cash > 0 AND COALESCE(SUM(CASE WHEN t.type = 'debit' AND t.mode = 'cash' THEN t.amount ELSE 0 END), 0) > f.budget_cash THEN true
    ELSE false
  END AS overspend_cash,
  CASE 
    WHEN f.budget_digital > 0 AND COALESCE(SUM(CASE WHEN t.type = 'debit' AND t.mode = 'digital' THEN t.amount ELSE 0 END), 0) > f.budget_digital THEN false
    ELSE false
  END AS overspend_digital,
  CASE 
    WHEN f.budget_total > 0 AND COALESCE(SUM(CASE WHEN t.type = 'debit' THEN t.amount ELSE 0 END), 0) > f.budget_total THEN true
    ELSE false
  END AS overspend_total
FROM functions f
LEFT JOIN transactions t ON t.function_id = f.id
GROUP BY f.id, f.name, f.description, f.budget_total, f.budget_cash, f.budget_digital, f.status, f.created_by, f.created_at, f.updated_at;

-- 7. View for function category budget summary
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
  COALESCE(SUM(CASE WHEN t.type = 'debit' THEN t.amount ELSE 0 END), 0) AS spent_total,
  (fc.budget_cash - COALESCE(SUM(CASE WHEN t.type = 'debit' AND t.mode = 'cash' THEN t.amount ELSE 0 END), 0)) AS remaining_cash,
  (fc.budget_digital - COALESCE(SUM(CASE WHEN t.type = 'debit' AND t.mode = 'digital' THEN t.amount ELSE 0 END), 0)) AS remaining_digital,
  (fc.budget_amount - COALESCE(SUM(CASE WHEN t.type = 'debit' THEN t.amount ELSE 0 END), 0)) AS remaining_total
FROM function_categories fc
LEFT JOIN categories c ON c.id = fc.category_id
LEFT JOIN transactions t ON t.function_category_id = fc.id
GROUP BY fc.id, fc.function_id, fc.category_id, c.name, fc.budget_amount, fc.budget_cash, fc.budget_digital;

-- 8. View for source balance (cash/digital income vs function expenses)
CREATE OR REPLACE VIEW v_source_balance AS
SELECT 
  COALESCE(SUM(CASE WHEN t.type = 'credit' AND t.mode = 'cash' THEN t.amount ELSE 0 END), 0) AS total_cash_income,
  COALESCE(SUM(CASE WHEN t.type = 'credit' AND t.mode = 'digital' THEN t.amount ELSE 0 END), 0) AS total_digital_income,
  COALESCE(SUM(CASE WHEN t.type = 'debit' AND t.mode = 'cash' AND t.function_id IS NOT NULL THEN t.amount ELSE 0 END), 0) AS total_cash_function_expenses,
  COALESCE(SUM(CASE WHEN t.type = 'debit' AND t.mode = 'digital' AND t.function_id IS NOT NULL THEN t.amount ELSE 0 END), 0) AS total_digital_function_expenses,
  COALESCE(SUM(CASE WHEN f.budget_cash IS NOT NULL THEN f.budget_cash ELSE 0 END), 0) AS total_allocated_cash_budget,
  COALESCE(SUM(CASE WHEN f.budget_digital IS NOT NULL THEN f.budget_digital ELSE 0 END), 0) AS total_allocated_digital_budget
FROM transactions t
FULL OUTER JOIN functions f ON true
WHERE t.type IS NOT NULL OR f.id IS NOT NULL;

-- 9. RLS Policies (adjust based on your auth setup)
ALTER TABLE functions ENABLE ROW LEVEL SECURITY;
ALTER TABLE function_categories ENABLE ROW LEVEL SECURITY;

-- Functions: authenticated users can view, admin/accountant can manage
CREATE POLICY "Functions viewable by authenticated" ON functions
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Functions manageable by admin/accountant" ON functions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles p 
      WHERE p.id = auth.uid() 
      AND p.role IN ('admin', 'accountant')
    )
  );

-- Function categories: similar to functions
CREATE POLICY "Function categories viewable by authenticated" ON function_categories
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Function categories manageable by admin/accountant" ON function_categories
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles p 
      WHERE p.id = auth.uid() 
      AND p.role IN ('admin', 'accountant')
    )
  );