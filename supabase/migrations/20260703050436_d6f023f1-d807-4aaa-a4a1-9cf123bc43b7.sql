
-- Lock down app_settings, locations, part_time_advance_tracking, part_time_settlements.
-- All app access is now routed through the session-validated `data-api` edge function
-- (which uses the service_role key and bypasses RLS).

-- ── app_settings ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow all access to app_settings" ON public.app_settings;
REVOKE ALL ON public.app_settings FROM anon;
REVOKE ALL ON public.app_settings FROM authenticated;
GRANT ALL ON public.app_settings TO service_role;
CREATE POLICY "Service role manages app_settings"
  ON public.app_settings FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ── locations ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow all operations for anon and authenticated users on locati" ON public.locations;
DROP POLICY IF EXISTS "Allow authenticated users to delete locations" ON public.locations;
DROP POLICY IF EXISTS "Allow authenticated users to insert locations" ON public.locations;
DROP POLICY IF EXISTS "Allow authenticated users to read locations" ON public.locations;
DROP POLICY IF EXISTS "Allow authenticated users to update locations" ON public.locations;
DROP POLICY IF EXISTS "Allow public access to locations" ON public.locations;
REVOKE ALL ON public.locations FROM anon;
REVOKE ALL ON public.locations FROM authenticated;
GRANT ALL ON public.locations TO service_role;
CREATE POLICY "Service role manages locations"
  ON public.locations FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ── part_time_advance_tracking ────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow anon access on part_time_advance_tracking" ON public.part_time_advance_tracking;
REVOKE ALL ON public.part_time_advance_tracking FROM anon;
REVOKE ALL ON public.part_time_advance_tracking FROM authenticated;
GRANT ALL ON public.part_time_advance_tracking TO service_role;
CREATE POLICY "Service role manages part_time_advance_tracking"
  ON public.part_time_advance_tracking FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ── part_time_settlements ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow anon access on part_time_settlements" ON public.part_time_settlements;
REVOKE ALL ON public.part_time_settlements FROM anon;
REVOKE ALL ON public.part_time_settlements FROM authenticated;
GRANT ALL ON public.part_time_settlements TO service_role;
CREATE POLICY "Service role manages part_time_settlements"
  ON public.part_time_settlements FOR ALL TO service_role
  USING (true) WITH CHECK (true);
