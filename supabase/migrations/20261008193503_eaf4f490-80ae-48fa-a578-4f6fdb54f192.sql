DROP POLICY IF EXISTS "Enable insert access for all users" ON public.salary_manual_overrides;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.salary_manual_overrides;
REVOKE ALL ON public.salary_manual_overrides FROM anon, authenticated;
GRANT ALL ON public.salary_manual_overrides TO service_role;
ALTER TABLE public.salary_manual_overrides ENABLE ROW LEVEL SECURITY;