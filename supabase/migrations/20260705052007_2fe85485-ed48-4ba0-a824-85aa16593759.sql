-- 1) Widen role check to include statutory_admin
ALTER TABLE public.app_users DROP CONSTRAINT IF EXISTS app_users_role_check;
ALTER TABLE public.app_users ADD CONSTRAINT app_users_role_check
  CHECK (role = ANY (ARRAY['admin'::text, 'manager'::text, 'statutory_admin'::text]));

-- 2) Seed statutory admin user (idempotent). Password 'Staffans7369' -> legacy simpleHash 'ev9y6d'.
INSERT INTO public.app_users (email, password_hash, full_name, role, is_active)
VALUES ('admin@staff.com', 'ev9y6d', 'Statutory Administrator', 'statutory_admin', true)
ON CONFLICT (email) DO UPDATE
  SET role = 'statutory_admin',
      is_active = true,
      password_hash = EXCLUDED.password_hash,
      full_name = EXCLUDED.full_name;

-- 3) Statutory portal configuration (single-row settings)
CREATE TABLE IF NOT EXISTS public.statutory_portal_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visible_pages jsonb NOT NULL DEFAULT '{"dashboard":true,"staff":true,"attendance":true,"salary":true,"reports":false,"leave":false,"profile":false,"settings":false}'::jsonb,
  dashboard_widgets jsonb NOT NULL DEFAULT '{"staffCount":true,"attendance":true,"salary":true,"breaks":false,"charts":true,"recentActivity":true,"quickActions":true}'::jsonb,
  data_visibility jsonb NOT NULL DEFAULT '{"salary":true,"attendance":true,"contact":true,"employeeId":true,"department":true,"designation":true,"documents":true,"leave":true}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.statutory_portal_config TO authenticated;
GRANT SELECT ON public.statutory_portal_config TO anon;
GRANT ALL ON public.statutory_portal_config TO service_role;

ALTER TABLE public.statutory_portal_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "portal cfg readable" ON public.statutory_portal_config;
CREATE POLICY "portal cfg readable" ON public.statutory_portal_config FOR SELECT USING (true);

DROP POLICY IF EXISTS "portal cfg writable" ON public.statutory_portal_config;
CREATE POLICY "portal cfg writable" ON public.statutory_portal_config FOR ALL USING (true) WITH CHECK (true);

-- Seed one row if empty
INSERT INTO public.statutory_portal_config (id)
SELECT gen_random_uuid()
WHERE NOT EXISTS (SELECT 1 FROM public.statutory_portal_config);

CREATE TRIGGER trg_statutory_portal_config_updated
  BEFORE UPDATE ON public.statutory_portal_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();