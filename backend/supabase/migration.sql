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
  voucher_filed boolean default false,
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

-- Add voucher_filed column if it doesn't exist (for existing databases)
DO $$ BEGIN
  ALTER TABLE transactions ADD COLUMN voucher_filed boolean default false;
exception
  when duplicate_column then null;
END $$;

drop view if exists v_cash_summary;
drop view if exists v_digital_summary;

create view v_cash_summary as
select
  coalesce((select value::numeric(12,2) from settings where key = 'cash_opening_balance'), 0::numeric(12,2)) as opening_balance,
  coalesce((select sum(amount) from transactions where type = 'credit' and mode = 'cash' and voucher_filed = true), 0::numeric(12,2)) as cash_in,
  coalesce((select sum(amount) from transactions where type = 'debit' and mode = 'cash' and voucher_filed = true), 0::numeric(12,2)) as cash_out,
  coalesce((select value::numeric(12,2) from settings where key = 'cash_opening_balance'), 0::numeric(12,2))
    + coalesce((select sum(amount) from transactions where type = 'credit' and mode = 'cash' and voucher_filed = true), 0::numeric(12,2))
    - coalesce((select sum(amount) from transactions where type = 'debit' and mode = 'cash' and voucher_filed = true), 0::numeric(12,2)) as cash_in_hand;

create view v_digital_summary as
select
  coalesce((select value::numeric(12,2) from settings where key = 'digital_opening_balance'), 0::numeric(12,2)) as digital_opening_balance,
  coalesce((select sum(amount) from transactions where type = 'credit' and mode = 'digital'), 0::numeric(12,2)) as digital_in,
  coalesce((select sum(amount) from transactions where type = 'debit' and mode = 'digital'), 0::numeric(12,2)) as digital_out,
  coalesce((select value::numeric(12,2) from settings where key = 'digital_opening_balance'), 0::numeric(12,2))
    + coalesce((select sum(amount) from transactions where type = 'credit' and mode = 'digital'), 0::numeric(12,2))
    - coalesce((select sum(amount) from transactions where type = 'debit' and mode = 'digital'), 0::numeric(12,2)) as digital_balance;

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
-- CONTACT GROUPS
-- ============================================
create table if not exists contact_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

create table if not exists contact_group_members (
  group_id uuid references contact_groups(id) on delete cascade,
  contact_id uuid references contacts(id) on delete cascade,
  primary key (group_id, contact_id)
);

-- ============================================
-- 5. ENABLE RLS ON ALL TABLES
-- ============================================
alter table profiles    enable row level security;
alter table contacts    enable row level security;
alter table contact_groups enable row level security;
alter table contact_group_members enable row level security;
alter table transactions enable row level security;
alter table categories  enable row level security;
alter table settings    enable row level security;

-- ============================================
-- 6. RLS POLICIES
-- ============================================

-- PROFILES
-- Anyone logged in can read their own profile; admins see all
drop policy if exists "read own profile" on profiles;
create policy "read own profile"
  on profiles for select
  using (auth.uid() = id or current_role_is(array['admin']));

-- Only admins can create/update/delete profiles
drop policy if exists "admin manage profiles" on profiles;
create policy "admin manage profiles"
  on profiles for all
  using (current_role_is(array['admin']));

-- CONTACTS
drop policy if exists "read contacts" on contacts;
create policy "read contacts"
  on contacts for select
  using (current_role_is(array['admin', 'accountant', 'viewer']));

drop policy if exists "insert contacts" on contacts;
create policy "insert contacts"
  on contacts for insert
  with check (current_role_is(array['admin', 'accountant']));

drop policy if exists "update contacts" on contacts;
create policy "update contacts"
  on contacts for update
  using (current_role_is(array['admin', 'accountant']));

drop policy if exists "delete contacts" on contacts;
create policy "delete contacts"
  on contacts for delete
  using (current_role_is(array['admin']));

-- CONTACT GROUPS
drop policy if exists "read contact_groups" on contact_groups;
create policy "read contact_groups"
  on contact_groups for select
  using (current_role_is(array['admin', 'accountant', 'viewer']));

drop policy if exists "insert contact_groups" on contact_groups;
create policy "insert contact_groups"
  on contact_groups for insert
  with check (current_role_is(array['admin', 'accountant']));

drop policy if exists "update contact_groups" on contact_groups;
create policy "update contact_groups"
  on contact_groups for update
  using (current_role_is(array['admin', 'accountant']));

drop policy if exists "delete contact_groups" on contact_groups;
create policy "delete contact_groups"
  on contact_groups for delete
  using (current_role_is(array['admin']));

-- CONTACT GROUP MEMBERS
drop policy if exists "read contact_group_members" on contact_group_members;
create policy "read contact_group_members"
  on contact_group_members for select
  using (current_role_is(array['admin', 'accountant', 'viewer']));

drop policy if exists "insert contact_group_members" on contact_group_members;
create policy "insert contact_group_members"
  on contact_group_members for insert
  with check (current_role_is(array['admin', 'accountant']));

drop policy if exists "delete contact_group_members" on contact_group_members;
create policy "delete contact_group_members"
  on contact_group_members for delete
  using (current_role_is(array['admin', 'accountant']));

-- TRANSACTIONS
drop policy if exists "read transactions" on transactions;
create policy "read transactions"
  on transactions for select
  using (current_role_is(array['admin', 'accountant', 'viewer']));

drop policy if exists "insert transactions" on transactions;
create policy "insert transactions"
  on transactions for insert
  with check (current_role_is(array['admin', 'accountant']));

drop policy if exists "update transactions" on transactions;
create policy "update transactions"
  on transactions for update
  using (current_role_is(array['admin', 'accountant']));

drop policy if exists "delete transactions" on transactions;
create policy "delete transactions"
  on transactions for delete
  using (current_role_is(array['admin']));

-- CATEGORIES (public read, admin-only write)
drop policy if exists "read categories" on categories;
create policy "read categories"
  on categories for select
  using (true);

drop policy if exists "admin manage categories" on categories;
create policy "admin manage categories"
  on categories for all
  using (current_role_is(array['admin']));

-- SETTINGS (opening balances)
drop policy if exists "read settings" on settings;
create policy "read settings"
  on settings for select
  using (current_role_is(array['admin', 'accountant', 'viewer']));

drop policy if exists "admin update settings" on settings;
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

-- ============================================
-- ACTIVITY LOGS
-- ============================================
create table if not exists activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id),
  user_email text,
  action text not null,
  entity text not null,
  entity_id uuid,
  details jsonb default '{}',
  ip_address text,
  created_at timestamptz default now()
);

create index if not exists idx_activity_logs_user on activity_logs(user_id);
create index if not exists idx_activity_logs_created on activity_logs(created_at desc);
create index if not exists idx_activity_logs_entity on activity_logs(entity);

alter table activity_logs enable row level security;

drop policy if exists "admin read all logs" on activity_logs;
create policy "admin read all logs" on activity_logs
  for select using (current_role_is(array['admin']));

drop policy if exists "user read own logs" on activity_logs;
create policy "user read own logs" on activity_logs
  for select using (auth.uid() = user_id);

-- ============================================
-- BACKUP LOGS
-- ============================================
create table if not exists backup_logs (
  id uuid primary key default gen_random_uuid(),
  backup_date date not null default current_date,
  trigger_type text not null default 'scheduled',
  status text not null default 'running',
  tables_backed_up integer default 0,
  total_rows integer default 0,
  file_size integer default 0,
  file_name text,
  telegram_sent boolean default false,
  error_message text,
  duration_ms integer default 0,
  created_at timestamptz default now()
);

create index if not exists idx_backup_logs_date on backup_logs(backup_date desc);

alter table backup_logs enable row level security;

drop policy if exists "admin read backup_logs" on backup_logs;
create policy "admin read backup_logs" on backup_logs
  for select using (current_role_is(array['admin']));

drop policy if exists "service insert backup_logs" on backup_logs;
create policy "service insert backup_logs" on backup_logs
  for insert with check (true);

drop policy if exists "service update backup_logs" on backup_logs;
create policy "service update backup_logs" on backup_logs
  for update using (true);
