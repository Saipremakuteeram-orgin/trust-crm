-- 26. Lock down direct PostgREST access
--
-- The browser ships the public anon key, so any table left without row level
-- security is readable and writable straight from Supabase's REST API, bypassing
-- every backend role check. The frontend only queries public.profiles (its own
-- row) directly; everything else goes through the backend, which uses the
-- service-role client and therefore bypasses RLS.
--
-- Idempotent: safe to run more than once.

BEGIN;

-- 1) Drop every permissive policy, including the legacy
--    "viewable by authenticated" SELECT policies that let any logged-in user
--    read ledgers, donations and payroll outside the API.
DO $$
DECLARE
  policy_row RECORD;
BEGIN
  FOR policy_row IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_row.policyname, policy_row.tablename);
  END LOOP;
END $$;

-- 2) Enable RLS on every existing public table (default deny with no policy).
DO $$
DECLARE
  table_row RECORD;
BEGIN
  FOR table_row IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_row.tablename);
  END LOOP;
END $$;

-- 3) The anon/authenticated roles no longer need direct table access.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;

-- 4) The single direct read the app still needs: a signed-in user's own profile
--    row (AuthContext resolves name/role). No writes, no other rows.
--    profiles is provisioned with the Supabase project (not by these
--    migrations), so guard the policy in case it is absent.
DO $$
BEGIN
  IF to_regclass('public.profiles') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT ON TABLE public.profiles TO authenticated';
    EXECUTE 'DROP POLICY IF EXISTS profiles_select_own ON public.profiles';
    EXECUTE 'CREATE POLICY profiles_select_own ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id)';
  END IF;
END $$;

COMMIT;
