CREATE TABLE public.payslip_links (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid REFERENCES public.tenants(id),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  month integer NOT NULL,
  year integer NOT NULL,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  issued_by text,
  expires_at timestamp with time zone NOT NULL,
  revoked_at timestamp with time zone,
  view_count integer NOT NULL DEFAULT 0,
  last_viewed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT ALL ON public.payslip_links TO service_role;

ALTER TABLE public.payslip_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages payslip links"
ON public.payslip_links FOR ALL TO service_role
USING (true) WITH CHECK (true);

CREATE INDEX idx_payslip_links_staff_period ON public.payslip_links(staff_id, year, month);

CREATE TRIGGER trg_payslip_links_updated
BEFORE UPDATE ON public.payslip_links
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_stamp_tenant_id
BEFORE INSERT ON public.payslip_links
FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_id();