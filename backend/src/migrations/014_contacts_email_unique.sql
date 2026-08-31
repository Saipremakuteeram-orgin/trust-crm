-- 014_contacts_email_unique.sql
-- Adds a `source` column (tracks where a contact came from, e.g. website_registration)
-- and a unique index on contacts.email so website registrations can be
-- upserted (deduped) by email from the webhook.
-- Run in the CRM Supabase SQL editor (project twgunjmacbfqqpjpgrjt). Safe to re-run.

-- Linkage / source column (mirrors functions.transactions pattern).
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS source TEXT;

-- Unique index on email so upserts/dedup are safe.
CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_email
  ON contacts (email)
  WHERE email IS NOT NULL AND email <> '';
