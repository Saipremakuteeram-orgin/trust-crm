-- 10. Function category items (line items within a sub-category)
CREATE TABLE IF NOT EXISTS function_category_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  function_category_id UUID REFERENCES function_categories(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  quantity NUMERIC(15,2) NOT NULL DEFAULT 1,
  unit_price NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_function_category_items_fc_id ON function_category_items(function_category_id);

CREATE OR REPLACE FUNCTION update_function_category_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_function_category_items_updated_at ON function_category_items;
CREATE TRIGGER update_function_category_items_updated_at
  BEFORE UPDATE ON function_category_items
  FOR EACH ROW EXECUTE FUNCTION update_function_category_items_updated_at();

ALTER TABLE function_category_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Function category items viewable by authenticated" ON function_category_items
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Function category items manageable by admin/accountant" ON function_category_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM function_categories fc
      JOIN functions f ON f.id = fc.function_id
      JOIN profiles p ON p.id = auth.uid()
      WHERE fc.id = function_category_items.function_category_id
      AND p.role IN ('admin', 'accountant')
    )
  );
