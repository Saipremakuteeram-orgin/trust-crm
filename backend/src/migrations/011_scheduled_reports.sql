-- Scheduled Reports

CREATE TABLE IF NOT EXISTS scheduled_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_by UUID REFERENCES profiles(id),
  filter_type TEXT[],
  filter_mode TEXT[],
  filter_categories TEXT[],
  filter_from DATE,
  filter_to DATE,
  schedule_type TEXT NOT NULL DEFAULT 'weekly',
  schedule_day INTEGER,
  schedule_hour INTEGER NOT NULL DEFAULT 8,
  schedule_minute INTEGER NOT NULL DEFAULT 0,
  format TEXT NOT NULL DEFAULT 'excel',
  delivery_email BOOLEAN DEFAULT TRUE,
  delivery_telegram BOOLEAN DEFAULT FALSE,
  recipient_mode TEXT NOT NULL DEFAULT 'subscribed',
  recipient_contact_ids TEXT[],
  recipient_group_ids TEXT[],
  enabled BOOLEAN DEFAULT TRUE,
  next_run_at TIMESTAMPTZ,
  last_run_at TIMESTAMPTZ,
  last_status TEXT,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_reports_enabled ON scheduled_reports(enabled);
CREATE INDEX IF NOT EXISTS idx_scheduled_reports_next_run ON scheduled_reports(next_run_at);

CREATE OR REPLACE FUNCTION update_scheduled_reports_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_scheduled_reports_updated_at ON scheduled_reports;
CREATE TRIGGER update_scheduled_reports_updated_at
  BEFORE UPDATE ON scheduled_reports
  FOR EACH ROW EXECUTE FUNCTION update_scheduled_reports_updated_at();

ALTER TABLE scheduled_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Scheduled reports viewable by admin/accountant" ON scheduled_reports
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'accountant'))
  );

CREATE POLICY "Scheduled reports manageable by admin/accountant" ON scheduled_reports
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'accountant'))
  );
