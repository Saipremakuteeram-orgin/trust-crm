-- 012_webhook_website_event.sql
-- Adds linkage columns so a website event maps 1:1 to a CRM budget Function.
-- Run this in the Supabase SQL Editor of the CRM project (twgunjmacbfqqpjpgrjt).
-- Safe to re-run (all operations are IF NOT EXISTS / idempotent).

ALTER TABLE functions ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE functions ADD COLUMN IF NOT EXISTS source_event_id TEXT;

-- Partial unique index: guarantees one Function per website event (idempotency).
CREATE UNIQUE INDEX IF NOT EXISTS idx_functions_source_event_id
  ON functions (source_event_id)
  WHERE source_event_id IS NOT NULL;
