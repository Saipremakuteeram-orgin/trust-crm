-- 20. Contact tags
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_contacts_tags ON contacts USING GIN (tags);
