
CREATE TABLE public.api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  key_prefix text NOT NULL,
  key_hash text NOT NULL,
  scopes text[] NOT NULL DEFAULT ARRAY['payroll:read','compliance:read'],
  created_by text,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX api_keys_key_hash_idx ON public.api_keys(key_hash);
CREATE INDEX api_keys_tenant_idx ON public.api_keys(tenant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_keys TO authenticated;
GRANT ALL ON public.api_keys TO service_role;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage their tenant api keys" ON public.api_keys FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.app_users u WHERE u.auth_id = auth.uid() AND u.is_active AND u.tenant_id = api_keys.tenant_id AND u.role IN ('admin','super_admin')))
WITH CHECK (EXISTS (SELECT 1 FROM public.app_users u WHERE u.auth_id = auth.uid() AND u.is_active AND u.tenant_id = api_keys.tenant_id AND u.role IN ('admin','super_admin')));

CREATE TABLE public.webhook_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  url text NOT NULL,
  secret text NOT NULL,
  events text[] NOT NULL DEFAULT ARRAY['payroll.run.generated','payroll.run.approved','compliance.export.generated','payslip.issued'],
  is_active boolean NOT NULL DEFAULT true,
  description text,
  last_delivery_at timestamptz,
  failure_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX webhook_endpoints_tenant_idx ON public.webhook_endpoints(tenant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.webhook_endpoints TO authenticated;
GRANT ALL ON public.webhook_endpoints TO service_role;
ALTER TABLE public.webhook_endpoints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage their tenant webhooks" ON public.webhook_endpoints FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.app_users u WHERE u.auth_id = auth.uid() AND u.is_active AND u.tenant_id = webhook_endpoints.tenant_id AND u.role IN ('admin','super_admin')))
WITH CHECK (EXISTS (SELECT 1 FROM public.app_users u WHERE u.auth_id = auth.uid() AND u.is_active AND u.tenant_id = webhook_endpoints.tenant_id AND u.role IN ('admin','super_admin')));

CREATE TABLE public.webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  endpoint_id uuid REFERENCES public.webhook_endpoints(id) ON DELETE CASCADE,
  event text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status_code integer,
  ok boolean NOT NULL DEFAULT false,
  error text,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX webhook_deliveries_tenant_idx ON public.webhook_deliveries(tenant_id, created_at DESC);

GRANT SELECT ON public.webhook_deliveries TO authenticated;
GRANT ALL ON public.webhook_deliveries TO service_role;
ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read their tenant webhook deliveries" ON public.webhook_deliveries FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.app_users u WHERE u.auth_id = auth.uid() AND u.is_active AND u.tenant_id = webhook_deliveries.tenant_id AND u.role IN ('admin','super_admin')));

CREATE TRIGGER trg_api_keys_updated BEFORE UPDATE ON public.api_keys FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_webhook_endpoints_updated BEFORE UPDATE ON public.webhook_endpoints FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_api_keys_stamp_tenant BEFORE INSERT ON public.api_keys FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_id();
CREATE TRIGGER trg_webhook_endpoints_stamp_tenant BEFORE INSERT ON public.webhook_endpoints FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_id();
