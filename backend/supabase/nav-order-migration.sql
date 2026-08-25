alter table public.profiles add column if not exists nav_order jsonb;
comment on column public.profiles.nav_order is 'User-ordered array of nav route paths';
