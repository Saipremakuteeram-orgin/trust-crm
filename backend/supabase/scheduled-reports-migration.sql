-- Migration: Convert filter_type and filter_mode from TEXT to TEXT[] for multi-select
-- Run this in Supabase SQL Editor AFTER the initial scheduled-reports.sql

-- Convert filter_type: TEXT -> TEXT[] (migrate existing single values to arrays)
ALTER TABLE scheduled_reports ALTER COLUMN filter_type TYPE TEXT[] USING (
  CASE WHEN filter_type IS NULL OR filter_type = '' THEN NULL
       ELSE ARRAY[filter_type] END
);

-- Convert filter_mode: TEXT -> TEXT[] (migrate existing single values to arrays)
ALTER TABLE scheduled_reports ALTER COLUMN filter_mode TYPE TEXT[] USING (
  CASE WHEN filter_mode IS NULL OR filter_mode = '' THEN NULL
       ELSE ARRAY[filter_mode] END
);

-- Add group-based recipient support
ALTER TABLE scheduled_reports ADD COLUMN IF NOT EXISTS recipient_group_ids UUID[];
