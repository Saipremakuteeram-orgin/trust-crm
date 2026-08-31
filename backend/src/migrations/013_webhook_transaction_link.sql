-- 013_webhook_transaction_link.sql
-- Adds linkage columns so a website donation maps 1:1 to a CRM transaction.
-- Run this in the Supabase SQL Editor of the CRM project (twgunjmacbfqqpjpgrjt).
-- Safe to re-run (all operations are IF NOT EXISTS / idempotent).

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS source_payment_id TEXT;

-- Partial unique index: guarantees one CRM transaction per Razorpay payment (idempotency).
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_source_payment_id
  ON transactions (source_payment_id)
  WHERE source_payment_id IS NOT NULL;
