CREATE TABLE public.audit_logs (
  id text PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  action text NOT NULL,
  staff_id text,
  staff_name text,
  details text NOT NULL,
  performed_by text NOT NULL,
  actor_id uuid,
  timestamp timestamptz NOT NULL DEFAULT now(),
  changes jsonb,
  before jsonb,
  after jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant admins can read audit logs"
ON public.audit_logs FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.app_users au
  WHERE au.auth_id = auth.uid()
    AND au.is_active = true
    AND au.role IN ('admin', 'super_admin')
    AND (au.role = 'super_admin' OR au.tenant_id = audit_logs.tenant_id)
));

CREATE TABLE public.error_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  actor_id uuid,
  actor_email text,
  message text NOT NULL,
  stack_trace text,
  component text NOT NULL,
  user_agent text,
  url text,
  timestamp timestamptz NOT NULL DEFAULT now(),
  severity text NOT NULL DEFAULT 'error',
  browser_info jsonb,
  fingerprint text,
  alert_sent_at timestamptz
);
GRANT SELECT ON public.error_logs TO authenticated;
GRANT ALL ON public.error_logs TO service_role;
ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant admins can read error logs"
ON public.error_logs FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.app_users au
  WHERE au.auth_id = auth.uid()
    AND au.is_active = true
    AND au.role IN ('admin', 'super_admin')
    AND (au.role = 'super_admin' OR au.tenant_id = error_logs.tenant_id)
));

CREATE INDEX audit_logs_tenant_timestamp_idx ON public.audit_logs (tenant_id, timestamp DESC);
CREATE INDEX error_logs_tenant_timestamp_idx ON public.error_logs (tenant_id, timestamp DESC);
CREATE INDEX error_logs_fingerprint_timestamp_idx ON public.error_logs (tenant_id, fingerprint, timestamp DESC);

CREATE OR REPLACE FUNCTION public.reject_immutable_log_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Compliance logs are immutable';
END;
$$;

CREATE TRIGGER audit_logs_immutable
BEFORE UPDATE OR DELETE ON public.audit_logs
FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_log_change();

CREATE TRIGGER error_logs_immutable
BEFORE UPDATE OR DELETE ON public.error_logs
FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_log_change();