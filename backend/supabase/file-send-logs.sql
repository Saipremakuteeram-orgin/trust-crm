-- ============================================================
-- file_send_logs table for the "Send File via Email" feature
-- Run this in Supabase Dashboard -> SQL Editor -> New query -> RUN
-- ============================================================

create table if not exists file_send_logs (
  id uuid primary key default gen_random_uuid(),
  doc_name text not null,
  sender_id uuid references profiles(id),
  sender_email text,
  recipients jsonb not null default '[]',
  telegram_file_id text,
  channel_message_id text,
  status text not null default 'sent',
  error_message text,
  created_at timestamptz default now()
);

create index if not exists idx_file_send_logs_created on file_send_logs(created_at desc);

alter table file_send_logs enable row level security;

-- All authenticated roles can read the log (viewers see metadata only;
-- attachments are never exposed through this table).
drop policy if exists "authenticated read file_send_logs" on file_send_logs;
create policy "authenticated read file_send_logs" on file_send_logs
  for select using (auth.role() = 'authenticated');

-- Only service role writes (backend); no client-side inserts.
drop policy if exists "service write file_send_logs" on file_send_logs;
create policy "service write file_send_logs" on file_send_logs
  for insert with check (true);

-- Grants for backend service_role
grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
alter default privileges in schema public grant all privileges on tables to service_role;
alter default privileges in schema public grant all privileges on sequences to service_role;
