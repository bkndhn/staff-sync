-- 1. app_users: remove anon/authenticated read
DROP POLICY IF EXISTS "Allow anon read access to app_users" ON public.app_users;
DROP POLICY IF EXISTS "Allow authenticated read access to app_users" ON public.app_users;
REVOKE ALL ON public.app_users FROM anon, authenticated;
GRANT ALL ON public.app_users TO service_role;

-- 2. face_embeddings + logs: service_role only
DROP POLICY IF EXISTS "Allow all access to face_embeddings" ON public.face_embeddings;
DROP POLICY IF EXISTS "Allow all access to face_registration_logs" ON public.face_registration_logs;
REVOKE ALL ON public.face_embeddings FROM anon, authenticated;
REVOKE ALL ON public.face_registration_logs FROM anon, authenticated;
GRANT ALL ON public.face_embeddings TO service_role;
GRANT ALL ON public.face_registration_logs TO service_role;
ALTER TABLE public.face_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.face_registration_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only on face_embeddings" ON public.face_embeddings FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role only on face_registration_logs" ON public.face_registration_logs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 3. salary_disbursements: drop public-role policy, service_role only
DROP POLICY IF EXISTS "Allow data-api access to salary_disbursements" ON public.salary_disbursements;
REVOKE ALL ON public.salary_disbursements FROM anon, authenticated;
GRANT ALL ON public.salary_disbursements TO service_role;
ALTER TABLE public.salary_disbursements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only on salary_disbursements" ON public.salary_disbursements FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 4. fix mutable search_path
CREATE OR REPLACE FUNCTION public.stamp_tenant_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := '00000000-0000-0000-0000-000000000001'::uuid;
  END IF;
  RETURN NEW;
END;
$function$;