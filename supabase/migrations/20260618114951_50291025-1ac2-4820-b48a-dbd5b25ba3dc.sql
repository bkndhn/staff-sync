
-- 1. Remove anon INSERT on app_users (privilege escalation risk).
-- User registration is performed server-side by the auth-create-user edge function (service_role).
DROP POLICY IF EXISTS "Allow anon insert access to app_users" ON public.app_users;

-- 2. Fix mutable search_path on handle_location_shift_updated_at.
CREATE OR REPLACE FUNCTION public.handle_location_shift_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 3. Recreate app_users_public view with security_invoker so it respects the caller's RLS,
-- not the view owner's elevated permissions.
DROP VIEW IF EXISTS public.app_users_public;
CREATE VIEW public.app_users_public
WITH (security_invoker = on)
AS
SELECT id, email, full_name, role, location, location_id, is_active, last_login, created_at, updated_at
FROM public.app_users;

GRANT SELECT ON public.app_users_public TO anon, authenticated;
GRANT ALL ON public.app_users_public TO service_role;
