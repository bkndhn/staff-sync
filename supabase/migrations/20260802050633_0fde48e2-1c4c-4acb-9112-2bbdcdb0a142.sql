-- Lock sensitive tables to service_role only (all app access goes through the
-- session-validated data-api edge function).

DROP POLICY IF EXISTS "Allow all operations on advances for all users" ON public.advances;
DROP POLICY IF EXISTS "Allow all operations on advance_entries for all users" ON public.advance_entries;
DROP POLICY IF EXISTS "Allow all operations on attendance for all users" ON public.attendance;
DROP POLICY IF EXISTS "Allow all on break_events" ON public.break_events;
DROP POLICY IF EXISTS "Allow all access to punch_events" ON public.punch_events;

REVOKE ALL ON public.advances FROM anon, authenticated;
REVOKE ALL ON public.advance_entries FROM anon, authenticated;
REVOKE ALL ON public.attendance FROM anon, authenticated;
REVOKE ALL ON public.break_events FROM anon, authenticated;
REVOKE ALL ON public.punch_events FROM anon, authenticated;
REVOKE ALL ON public.app_users FROM anon, authenticated;
REVOKE ALL ON public.staff FROM anon, authenticated;

GRANT ALL ON public.advances TO service_role;
GRANT ALL ON public.advance_entries TO service_role;
GRANT ALL ON public.attendance TO service_role;
GRANT ALL ON public.break_events TO service_role;
GRANT ALL ON public.punch_events TO service_role;
GRANT ALL ON public.app_users TO service_role;
GRANT ALL ON public.staff TO service_role;

ALTER TABLE public.advances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.advance_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.break_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.punch_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "advances_service_role_only" ON public.advances FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "advance_entries_service_role_only" ON public.advance_entries FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "attendance_service_role_only" ON public.attendance FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "break_events_service_role_only" ON public.break_events FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "punch_events_service_role_only" ON public.punch_events FOR ALL TO service_role USING (true) WITH CHECK (true);

-- app_users: replace the ambiguous public-role SELECT policy with an explicit
-- service_role-scoped one.
DROP POLICY IF EXISTS "Service role only select on app_users" ON public.app_users;
CREATE POLICY "Service role only select on app_users" ON public.app_users FOR SELECT TO service_role USING (true);
