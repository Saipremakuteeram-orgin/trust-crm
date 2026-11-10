-- 25. Assets / inventory
CREATE TABLE IF NOT EXISTS assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT,
  value NUMERIC(15,2) DEFAULT 0,
  location TEXT,
  purchase_date DATE,
  status TEXT DEFAULT 'active' CHECK (status IN ('active','disposed','maintenance')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
