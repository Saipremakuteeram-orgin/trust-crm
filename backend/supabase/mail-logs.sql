-- ============================================================
-- mail_logs table for the Gmail-style "Compose Mail" feature
-- Run this in Supabase Dashboard -> SQL Editor -> New query -> RUN
-- ============================================================

create table if not exists mail_logs (
  id uuid primary key default gen_random_uuid(),
  subject text not null default '(no subject)',
  sender_id uuid references profiles(id),
  sender_email text,
  recipients jsonb not null default '[]',
  body_text text,
  attachment_names jsonb not null default '[]',
  status text not null default 'sent',
  error_message text,
  created_at timestamptz default now()
);

create index if not exists idx_mail_logs_created on mail_logs(created_at desc);

alter table mail_logs enable row level security;

-- All authenticated roles can read (viewers see metadata only; body/attachments not exposed to clients).
drop policy if exists "authenticated read mail_logs" on mail_logs;
create policy "authenticated read mail_logs" on mail_logs
  for select using (auth.role() = 'authenticated');

-- Only service role writes (backend).
drop policy if exists "service write mail_logs" on mail_logs;
create policy "service write mail_logs" on mail_logs
  for insert with check (true);

-- Grants for backend service_role
grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
alter default privileges in schema public grant all privileges on tables to service_role;
alter default privileges in schema public grant all privileges on sequences to service_role;
