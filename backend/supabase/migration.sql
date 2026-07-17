-- ============================================
-- TRUST CRM — SUPABASE MIGRATION
-- Paste this entire file into Supabase SQL Editor
-- and click "Run" to apply RLS + schema fixes
-- ============================================

-- ============================================
-- 1. TYPES
-- ============================================
DO $$ BEGIN
  create type user_role as enum ('admin', 'accountant', 'viewer');
exception
  when duplicate_object then null;
END $$;

DO $$ BEGIN
  create type txn_type as enum ('credit', 'debit');
exception
  when duplicate_object then null;
END $$;

DO $$ BEGIN
  create type payment_mode as enum ('cash', 'digital');
exception
  when duplicate_object then null;
END $$;

DO $$ BEGIN
  create type digital_method as enum ('upi', 'bank_transfer', 'card', 'cheque', 'other');
exception
  when duplicate_object then null;
END $$;

DO $$ BEGIN
  create type notify_status as enum ('pending', 'sent', 'partial', 'failed');
exception
  when duplicate_object then null;
END $$;

-- ============================================
-- 2. TABLES
-- ============================================

-- Profiles (linked to Supabase auth.users)
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role user_role not null default 'accountant',
  created_at timestamptz default now()
);

-- Contacts: people who get notified (email + Telegram)
create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  telegram_chat_id text,
  phone text,
  subscribe_monthly_report boolean default false,
  enabled boolean default true,
  notes text,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

-- Expense/income categories
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  name text unique not null
);

insert into categories (name) values
  ('Donation'), ('Prayer / Events'), ('Maintenance'), ('Utilities'),
  ('Salaries'), ('Charity Given'), ('Food / Prasadam'), ('Travel'), ('Miscellaneous')
on conflict (name) do nothing;

-- Transactions: single ledger for credit (in) and debit (out)
create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  type txn_type not null,
  mode payment_mode not null,
  digital_method digital_method,
  amount numeric(12,2) not null check (amount > 0),
  currency text default 'INR',
  category_id uuid references categories(id),
  party text,
  reference_no text,
  description text,
  txn_date date not null default current_date,
  notify_contact_ids uuid[] default '{}',
  notification_status notify_status default 'pending',
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

create index if not exists idx_transactions_date on transactions(txn_date);
create index if not exists idx_transactions_type on transactions(type);

-- Settings: key-value store for opening balances
create table if not exists settings (
  key text primary key,
  value text not null,
  updated_at timestamptz default now()
);

-- Seed default opening balances
insert into settings (key, value) values
  ('cash_opening_balance', '0'),
  ('digital_opening_balance', '0')
on conflict (key) do nothing;

-- ============================================
-- 3. VIEWS
-- ============================================
create or replace view v_cash_summary as
select
  coalesce((select value::numeric from settings where key = 'cash_opening_balance'), 0) as opening_balance,
  coalesce((select sum(amount) from transactions where type = 'credit' and mode = 'cash'), 0) as cash_in,
  coalesce((select sum(amount) from transactions where type = 'debit' and mode = 'cash'), 0) as cash_out,
  coalesce((select value::numeric from settings where key = 'cash_opening_balance'), 0)
    + coalesce((select sum(amount) from transactions where type = 'credit' and mode = 'cash'), 0)
    - coalesce((select sum(amount) from transactions where type = 'debit' and mode = 'cash'), 0) as cash_in_hand;

create or replace view v_digital_summary as
select
  coalesce((select value::numeric from settings where key = 'digital_opening_balance'), 0) as digital_opening_balance,
  coalesce((select sum(amount) from transactions where type = 'credit' and mode = 'digital'), 0) as digital_in,
  coalesce((select sum(amount) from transactions where type = 'debit' and mode = 'digital'), 0) as digital_out,
  coalesce((select value::numeric from settings where key = 'digital_opening_balance'), 0)
    + coalesce((select sum(amount) from transactions where type = 'credit' and mode = 'digital'), 0)
    - coalesce((select sum(amount) from transactions where type = 'debit' and mode = 'digital'), 0) as digital_balance;

-- ============================================
-- 4. HELPER FUNCTION (used by all RLS policies)
-- ============================================
create or replace function current_role_is(roles text[])
returns boolean language sql security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role::text = any(roles)
  );
$$;

-- ============================================
-- 5. ENABLE RLS ON ALL TABLES
-- ============================================
alter table profiles    enable row level security;
alter table contacts    enable row level security;
alter table transactions enable row level security;
alter table categories  enable row level security;
alter table settings    enable row level security;

-- ============================================
-- 6. RLS POLICIES
-- ============================================

-- PROFILES
-- Anyone logged in can read their own profile; admins see all
create policy "read own profile"
  on profiles for select
  using (auth.uid() = id or current_role_is(array['admin']));

-- Only admins can create/update/delete profiles
create policy "admin manage profiles"
  on profiles for all
  using (current_role_is(array['admin']));

-- CONTACTS
create policy "read contacts"
  on contacts for select
  using (current_role_is(array['admin', 'accountant', 'viewer']));

create policy "insert contacts"
  on contacts for insert
  with check (current_role_is(array['admin', 'accountant']));

create policy "update contacts"
  on contacts for update
  using (current_role_is(array['admin', 'accountant']));

create policy "delete contacts"
  on contacts for delete
  using (current_role_is(array['admin']));

-- TRANSACTIONS
create policy "read transactions"
  on transactions for select
  using (current_role_is(array['admin', 'accountant', 'viewer']));

create policy "insert transactions"
  on transactions for insert
  with check (current_role_is(array['admin', 'accountant']));

create policy "update transactions"
  on transactions for update
  using (current_role_is(array['admin', 'accountant']));

create policy "delete transactions"
  on transactions for delete
  using (current_role_is(array['admin']));

-- CATEGORIES (public read, admin-only write)
create policy "read categories"
  on categories for select
  using (true);

create policy "admin manage categories"
  on categories for all
  using (current_role_is(array['admin']));

-- SETTINGS (opening balances)
create policy "read settings"
  on settings for select
  using (current_role_is(array['admin', 'accountant', 'viewer']));

create policy "admin update settings"
  on settings for update
  using (current_role_is(array['admin']));

-- ============================================
-- 7. AUTO-CREATE PROFILE ON SIGNUP
-- ============================================
create or replace function handle_new_user()
returns trigger language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email), 'accountant');
  return new;
end;
$$;

-- Drop old trigger if it exists, then recreate
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
