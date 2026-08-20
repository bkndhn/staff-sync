CREATE TABLE IF NOT EXISTS public.payroll_rules (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    rule_key text NOT NULL, 
    expression text NOT NULL,
    description text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(tenant_id, rule_key)
);

ALTER TABLE public.payroll_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant admin full access to payroll_rules"
ON public.payroll_rules FOR ALL
USING (
    tenant_id = (SELECT tenant_id FROM public.app_users WHERE auth_id = auth.uid())
)
WITH CHECK (
    tenant_id = (SELECT tenant_id FROM public.app_users WHERE auth_id = auth.uid())
);
