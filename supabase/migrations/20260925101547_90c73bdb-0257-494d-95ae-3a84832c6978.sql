CREATE TABLE public.expense_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  staff_id uuid NOT NULL,
  staff_name text,
  location text,
  claim_date date NOT NULL DEFAULT CURRENT_DATE,
  category text NOT NULL DEFAULT 'other',
  amount numeric NOT NULL DEFAULT 0,
  description text,
  receipt_url text,
  status text NOT NULL DEFAULT 'pending',
  reviewed_by text,
  review_notes text,
  reviewed_at timestamptz,
  paid_month integer,
  paid_year integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_expense_claims_tenant ON public.expense_claims (tenant_id);
CREATE INDEX idx_expense_claims_staff ON public.expense_claims (staff_id);
CREATE INDEX idx_expense_claims_status ON public.expense_claims (status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_claims TO authenticated;
GRANT ALL ON public.expense_claims TO service_role;

ALTER TABLE public.expense_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can read expense claims"
ON public.expense_claims FOR SELECT TO authenticated
USING (tenant_id IN (SELECT tenant_id FROM public.app_users WHERE auth_id = auth.uid() AND is_active = true));

CREATE POLICY "Tenant members can create expense claims"
ON public.expense_claims FOR INSERT TO authenticated
WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.app_users WHERE auth_id = auth.uid() AND is_active = true));

CREATE POLICY "Tenant members can update expense claims"
ON public.expense_claims FOR UPDATE TO authenticated
USING (tenant_id IN (SELECT tenant_id FROM public.app_users WHERE auth_id = auth.uid() AND is_active = true))
WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.app_users WHERE auth_id = auth.uid() AND is_active = true));

CREATE POLICY "Admins can delete expense claims"
ON public.expense_claims FOR DELETE TO authenticated
USING (tenant_id IN (SELECT tenant_id FROM public.app_users WHERE auth_id = auth.uid() AND is_active = true AND role IN ('admin','super_admin')));

CREATE TRIGGER trg_expense_claims_stamp_tenant
BEFORE INSERT ON public.expense_claims
FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_id();

CREATE TRIGGER trg_expense_claims_updated
BEFORE UPDATE ON public.expense_claims
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();