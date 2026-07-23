-- ============================================
-- RECURRING TRANSACTIONS
-- ============================================

DO $$ BEGIN
  create type recurring_frequency as enum ('daily','weekly','biweekly','monthly','quarterly','yearly');
exception
  when duplicate_object then null;
END $$;

create table if not exists recurring_transactions (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  type             txn_type not null,
  mode             payment_mode not null,
  digital_method   digital_method,
  amount           numeric(12,2) not null check (amount > 0),
  currency         text default 'INR',
  category_id      uuid references categories(id),
  party            text,
  description      text,
  reference_no     text,
  notify_contact_ids uuid[] default '{}',

  frequency        recurring_frequency not null,
  schedule_day     integer,
  schedule_hour    integer default 8 check (schedule_hour >= 0 and schedule_hour <= 23),
  schedule_minute  integer default 0 check (schedule_minute >= 0 and schedule_minute <= 59),

  start_date       date not null,
  end_date         date,
  max_occurrences  integer,

  enabled          boolean default true,
  occurrence_count integer default 0,
  next_run_at      timestamptz,
  last_run_at      timestamptz,
  last_txn_id      uuid,

  created_by       uuid references profiles(id),
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

create index if not exists idx_recurring_next_run on recurring_transactions(next_run_at) where enabled = true;
create index if not exists idx_recurring_created_by on recurring_transactions(created_by);

-- Add is_recurring and recurring_id to transactions
DO $$ BEGIN
  ALTER TABLE transactions ADD COLUMN is_recurring boolean default false;
exception
  when duplicate_column then null;
END $$;

DO $$ BEGIN
  ALTER TABLE transactions ADD COLUMN recurring_id uuid references recurring_transactions(id);
exception
  when duplicate_column then null;
END $$;

create index if not exists idx_transactions_recurring on transactions(recurring_id) where is_recurring = true;

-- RLS
alter table recurring_transactions enable row level security;

drop policy if exists "read recurring_transactions" on recurring_transactions;
create policy "read recurring_transactions"
  on recurring_transactions for select
  using (current_role_is(array['admin','accountant','viewer']));

drop policy if exists "insert recurring_transactions" on recurring_transactions;
create policy "insert recurring_transactions"
  on recurring_transactions for insert
  with check (current_role_is(array['admin','accountant']));

drop policy if exists "update recurring_transactions" on recurring_transactions;
create policy "update recurring_transactions"
  on recurring_transactions for update
  using (current_role_is(array['admin','accountant']));

drop policy if exists "delete recurring_transactions" on recurring_transactions;
create policy "delete recurring_transactions"
  on recurring_transactions for delete
  using (current_role_is(array['admin']));

GRANT ALL PRIVILEGES ON recurring_transactions TO service_role;
