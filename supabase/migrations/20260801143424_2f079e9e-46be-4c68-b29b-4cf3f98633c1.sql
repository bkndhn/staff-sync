ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS contact_name text,
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS contact_phone text,
  ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS tenants_slug_key ON public.tenants (slug) WHERE slug IS NOT NULL;

DROP TRIGGER IF EXISTS trg_tenants_updated_at ON public.tenants;
CREATE TRIGGER trg_tenants_updated_at
BEFORE UPDATE ON public.tenants
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_check_tenant_staff_limit ON public.staff;
CREATE TRIGGER trg_check_tenant_staff_limit
BEFORE INSERT ON public.staff
FOR EACH ROW WHEN (NEW.tenant_id IS NOT NULL)
EXECUTE FUNCTION public.check_tenant_staff_limit();

CREATE INDEX IF NOT EXISTS idx_staff_tenant_id ON public.staff (tenant_id);
CREATE INDEX IF NOT EXISTS idx_attendance_tenant_id ON public.attendance (tenant_id);
CREATE INDEX IF NOT EXISTS idx_app_users_tenant_id ON public.app_users (tenant_id);