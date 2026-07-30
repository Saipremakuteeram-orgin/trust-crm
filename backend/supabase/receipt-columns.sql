-- Add receipt file columns to transactions table
-- Run this in Supabase SQL Editor

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS receipt_file_id text,
  ADD COLUMN IF NOT EXISTS receipt_file_name text,
  ADD COLUMN IF NOT EXISTS receipt_file_size bigint,
  ADD COLUMN IF NOT EXISTS receipt_mime_type text;

-- Add comment for documentation
COMMENT ON COLUMN transactions.receipt_file_id IS 'Telegram file_id for the uploaded receipt';
COMMENT ON COLUMN transactions.receipt_file_name IS 'Original filename of the receipt';
COMMENT ON COLUMN transactions.receipt_file_size IS 'File size in bytes';
COMMENT ON COLUMN transactions.receipt_mime_type IS 'MIME type of the receipt file';