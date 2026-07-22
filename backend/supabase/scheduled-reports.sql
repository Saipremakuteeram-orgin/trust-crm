-- scheduled_reports: custom report schedules for admin/accountant
CREATE TABLE IF NOT EXISTS scheduled_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id),

  -- Filters
  filter_type TEXT,          -- null=all, 'credit', 'debit'
  filter_mode TEXT,          -- null=all, 'cash', 'digital'
  filter_categories UUID[],  -- null=all categories
  filter_from DATE,          -- custom date range (once-only)
  filter_to DATE,

  -- Schedule
  schedule_type TEXT NOT NULL,  -- 'once','daily','weekly','biweekly','monthly'
  schedule_day INTEGER,         -- 0-6 (weekly), 1-31 (monthly)
  schedule_hour INTEGER DEFAULT 8,
  schedule_minute INTEGER DEFAULT 0,
  next_run_at TIMESTAMPTZ,

  -- Delivery
  format TEXT NOT NULL DEFAULT 'excel',  -- 'excel','pdf','summary'
  delivery_email BOOLEAN DEFAULT true,
  delivery_telegram BOOLEAN DEFAULT false,
  recipient_mode TEXT NOT NULL DEFAULT 'subscribed',  -- 'subscribed' or 'selected'
  recipient_contact_ids UUID[],

  -- Status
  enabled BOOLEAN DEFAULT true,
  last_run_at TIMESTAMPTZ,
  last_status TEXT,
  last_error TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE scheduled_reports ENABLE ROW LEVEL SECURITY;

-- Admin/accountant full access
CREATE POLICY "scheduled_reports_admin_accountant" ON scheduled_reports
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('admin', 'accountant')
    )
  );

CREATE INDEX IF NOT EXISTS idx_scheduled_reports_next_run ON scheduled_reports (next_run_at) WHERE enabled = true;
