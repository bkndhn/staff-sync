CREATE TABLE public.staff_fingerprints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES public.tenants(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  staff_name text,
  credential_id text NOT NULL,
  device_label text,
  enrolled_by text,
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, credential_id)
);
CREATE INDEX idx_staff_fingerprints_staff ON public.staff_fingerprints(tenant_id, staff_id);
REVOKE ALL ON public.staff_fingerprints FROM anon, authenticated;
GRANT ALL ON public.staff_fingerprints TO service_role;
ALTER TABLE public.staff_fingerprints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only on staff_fingerprints" ON public.staff_fingerprints FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE TRIGGER trg_stamp_tenant_id BEFORE INSERT ON public.staff_fingerprints FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_id();
CREATE TRIGGER trg_staff_fingerprints_updated_at BEFORE UPDATE ON public.staff_fingerprints FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();