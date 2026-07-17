-- ============================================
-- TRUST CRM — SUPABASE SCHEMA
-- ============================================

create type user_role as enum ('admin', 'accountant', 'viewer');
create type txn_type as enum ('credit', 'debit');
create type payment_mode as enum ('cash', 'digital');
create type digital_method as enum ('upi', 'bank_transfer', 'card', 'cheque', 'other');
create type notify_status as enum ('pending', 'sent', 'partial', 'failed');

-- Profiles (linked to Supabase auth.users)
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role user_role not null default 'accountant',
  created_at timestamptz default now()
);

-- Contacts: people who get notified (email + Telegram)
create table contacts (
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
create table categories (
  id uuid primary key default gen_random_uuid(),
  name text unique not null
);
insert into categories (name) values
  ('Donation'), ('Prayer / Events'), ('Maintenance'), ('Utilities'),
  ('Salaries'), ('Charity Given'), ('Food / Prasadam'), ('Travel'), ('Miscellaneous');

-- Transactions: single ledger for credit (in) and debit (out)
create table transactions (
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

create index idx_transactions_date on transactions(txn_date);
create index idx_transactions_type on transactions(type);

-- Settings: key-value store for opening balances
create table settings (
  key text primary key,
  value text not null,
  updated_at timestamptz default now()
);
insert into settings (key, value) values
  ('cash_opening_balance', '0'),
  ('digital_opening_balance', '0');

-- ============================================
-- VIEWS
-- ============================================
drop view if exists v_cash_summary;
drop view if exists v_digital_summary;

create view v_cash_summary as
select
  coalesce((select value::numeric(12,2) from settings where key = 'cash_opening_balance'), 0::numeric(12,2)) as opening_balance,
  coalesce((select sum(amount) from transactions where type='credit' and mode='cash'), 0::numeric(12,2)) as cash_in,
  coalesce((select sum(amount) from transactions where type='debit' and mode='cash'), 0::numeric(12,2)) as cash_out,
  coalesce((select value::numeric(12,2) from settings where key = 'cash_opening_balance'), 0::numeric(12,2))
    + coalesce((select sum(amount) from transactions where type='credit' and mode='cash'), 0::numeric(12,2))
    - coalesce((select sum(amount) from transactions where type='debit' and mode='cash'), 0::numeric(12,2)) as cash_in_hand;

create view v_digital_summary as
select
  coalesce((select value::numeric(12,2) from settings where key = 'digital_opening_balance'), 0::numeric(12,2)) as digital_opening_balance,
  coalesce((select sum(amount) from transactions where type='credit' and mode='digital'), 0::numeric(12,2)) as digital_in,
  coalesce((select sum(amount) from transactions where type='debit' and mode='digital'), 0::numeric(12,2)) as digital_out,
  coalesce((select value::numeric(12,2) from settings where key = 'digital_opening_balance'), 0::numeric(12,2))
    + coalesce((select sum(amount) from transactions where type='credit' and mode='digital'), 0::numeric(12,2))
    - coalesce((select sum(amount) from transactions where type='debit' and mode='digital'), 0::numeric(12,2)) as digital_balance;

-- ============================================
-- HELPER FUNCTION
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
-- RLS
-- ============================================
alter table profiles enable row level security;
alter table contacts enable row level security;
alter table transactions enable row level security;
alter table categories enable row level security;
alter table settings enable row level security;

-- PROFILES
create policy "read own profile" on profiles
  for select using (auth.uid() = id or current_role_is(array['admin']));
create policy "admin manage profiles" on profiles
  for all using (current_role_is(array['admin']));

-- CONTACTS
create policy "read contacts" on contacts
  for select using (current_role_is(array['admin','accountant','viewer']));
create policy "insert contacts" on contacts
  for insert with check (current_role_is(array['admin','accountant']));
create policy "update contacts" on contacts
  for update using (current_role_is(array['admin','accountant']));
create policy "delete contacts" on contacts
  for delete using (current_role_is(array['admin']));

-- TRANSACTIONS
create policy "read transactions" on transactions
  for select using (current_role_is(array['admin','accountant','viewer']));
create policy "insert transactions" on transactions
  for insert with check (current_role_is(array['admin','accountant']));
create policy "update transactions" on transactions
  for update using (current_role_is(array['admin','accountant']));
create policy "delete transactions" on transactions
  for delete using (current_role_is(array['admin']));

-- CATEGORIES
create policy "read categories" on categories
  for select using (true);
create policy "admin manage categories" on categories
  for all using (current_role_is(array['admin']));

-- SETTINGS
create policy "read settings" on settings
  for select using (current_role_is(array['admin','accountant','viewer']));
create policy "admin update settings" on settings
  for update using (current_role_is(array['admin']));

-- ============================================
-- AUTO-CREATE PROFILE ON SIGNUP
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
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();
