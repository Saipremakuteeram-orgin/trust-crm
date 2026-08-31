-- 014_contacts_email_unique.sql
-- Adds a unique index on contacts.email so website registrations can be
-- upserted (deduped) by email from the webhook. Run in the CRM Supabase SQL
-- editor (project twgunjmacbfqqpjpgrjt). Safe to re-run.

-- Normalize nulls/empties aside; unique index only constrains non-null emails.
CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_email
  ON contacts (email)
  WHERE email IS NOT NULL AND email <> '';
