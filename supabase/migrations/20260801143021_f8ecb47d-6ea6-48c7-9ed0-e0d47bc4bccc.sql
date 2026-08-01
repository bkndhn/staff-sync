DROP POLICY IF EXISTS "Allow service role on tenants" ON public.tenants;
DROP POLICY IF EXISTS "Allow super_admin on tenants" ON public.tenants;

REVOKE ALL ON public.tenants FROM anon, authenticated;
GRANT ALL ON public.tenants TO service_role;

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on tenants"
ON public.tenants
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.check_tenant_staff_limit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
    current_count INT;
    max_limit INT;
BEGIN
    SELECT COUNT(*) INTO current_count FROM public.staff WHERE tenant_id = NEW.tenant_id;
    SELECT staff_limit INTO max_limit FROM public.tenants WHERE id = NEW.tenant_id;
    IF current_count >= max_limit THEN
        RAISE EXCEPTION 'Staff limit (%) reached for this client.', max_limit;
    END IF;
    RETURN NEW;
END;
$function$;