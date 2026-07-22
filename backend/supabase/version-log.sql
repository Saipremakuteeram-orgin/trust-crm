-- Add snapshot column to backup_logs for version diffing
ALTER TABLE backup_logs ADD COLUMN IF NOT EXISTS snapshot jsonb default null;
