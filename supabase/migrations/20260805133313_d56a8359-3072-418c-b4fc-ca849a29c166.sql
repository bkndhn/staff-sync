CREATE TABLE public.loan_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  staff_name text,
  location text,
  floor text,
  amount numeric NOT NULL CHECK (amount > 0),
  reason text NOT NULL,
  emi_months integer NOT NULL DEFAULT 1 CHECK (emi_months >= 1 AND emi_months <= 60),
  start_month integer NOT NULL,
  start_year integer NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  current_approval_level integer NOT NULL DEFAULT 1,
  required_approval_levels integer NOT NULL DEFAULT 1,
  approval_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  rejection_reason text,
  advance_entry_id uuid,
  approved_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT ALL ON public.loan_requests TO service_role;

ALTER TABLE public.loan_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages loan requests"
ON public.loan_requests FOR ALL TO service_role
USING (true) WITH CHECK (true);

CREATE TRIGGER trg_loan_requests_updated
BEFORE UPDATE ON public.loan_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_stamp_tenant_id
BEFORE INSERT ON public.loan_requests
FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_id();

CREATE INDEX idx_loan_requests_staff ON public.loan_requests(staff_id);
CREATE INDEX idx_loan_requests_status ON public.loan_requests(tenant_id, status);