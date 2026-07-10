
DROP POLICY IF EXISTS "Allow all on break_events" ON public.break_events;
CREATE POLICY "Allow all on break_events" ON public.break_events FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Enable all access for all users" ON public.payroll_runs;
CREATE POLICY "Enable all access for all users" ON public.payroll_runs FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Enable all access for all users" ON public.payroll_snapshots;
CREATE POLICY "Enable all access for all users" ON public.payroll_snapshots FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Enable read access for all users" ON public.salary_manual_overrides;
DROP POLICY IF EXISTS "Enable insert access for all users" ON public.salary_manual_overrides;
DROP POLICY IF EXISTS "Enable update access for all users" ON public.salary_manual_overrides;
DROP POLICY IF EXISTS "Enable delete access for all users" ON public.salary_manual_overrides;
CREATE POLICY "Enable read access for all users" ON public.salary_manual_overrides FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Enable insert access for all users" ON public.salary_manual_overrides FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Enable update access for all users" ON public.salary_manual_overrides FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable delete access for all users" ON public.salary_manual_overrides FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "portal cfg readable" ON public.statutory_portal_config;
CREATE POLICY "portal cfg readable" ON public.statutory_portal_config FOR SELECT TO anon, authenticated USING (true);
