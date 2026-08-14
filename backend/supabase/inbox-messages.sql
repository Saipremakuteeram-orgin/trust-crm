-- ============================================================
-- inbox_messages table for incoming mail (Inbox feature)
-- Run this in Supabase Dashboard -> SQL Editor -> New query -> RUN
-- ============================================================

create table if not exists inbox_messages (
  id uuid primary key default gen_random_uuid(),
  message_id text unique,                    -- Email Message-ID header
  from_email text not null,
  from_name text,
  to_email text not null,                    -- Our email that received it
  subject text,
  body_text text,
  body_html text,
  attachments jsonb not null default '[]',   -- [{filename, content_type, size, url}]
  headers jsonb,                             -- Raw email headers for debugging
  status text not null default 'unread',     -- unread, read, archived, deleted
  is_spam boolean default false,
  spam_score numeric,
  received_at timestamptz default now(),
  read_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists idx_inbox_received on inbox_messages(received_at desc);
create index if not exists idx_inbox_status on inbox_messages(status);
create index if not exists idx_inbox_to_email on inbox_messages(to_email);
create index if not exists idx_inbox_message_id on inbox_messages(message_id);

alter table inbox_messages enable row level security;

-- All authenticated roles can read inbox
drop policy if exists "authenticated read inbox_messages" on inbox_messages;
create policy "authenticated read inbox_messages" on inbox_messages
  for select using (auth.role() = 'authenticated');

-- Service role can insert/update (backend webhook)
drop policy if exists "service write inbox_messages" on inbox_messages;
create policy "service write inbox_messages" on inbox_messages
  for all using (true) with check (true);

-- Grants for backend service_role
grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
alter default privileges in schema public grant all privileges on tables to service_role;
alter default privileges in schema public grant all privileges on sequences to service_role;