ALTER TABLE public.face_embeddings
  ADD COLUMN IF NOT EXISTS model_version text NOT NULL DEFAULT 'faceapi-resnet34-128',
  ADD COLUMN IF NOT EXISTS quality_metrics jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_face_embeddings_model_version
  ON public.face_embeddings (tenant_id, model_version, is_approved);

CREATE TABLE IF NOT EXISTS public.statutory_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  tds jsonb NOT NULL DEFAULT '{"enabled":false,"mode":"slab","regime":"new","flatPercentage":10}'::jsonb,
  pf jsonb NOT NULL DEFAULT '{"enabled":true,"wageCeiling":15000,"employeeRate":12,"employerRate":12,"applyCeiling":true,"vpfAllowed":false}'::jsonb,
  esi jsonb NOT NULL DEFAULT '{"enabled":true,"wageThreshold":21000,"employeeRate":0.75,"employerRate":3.25}'::jsonb,
  pt jsonb NOT NULL DEFAULT '{"enabled":false,"state":"TN","slabs":[]}'::jsonb,
  lwf jsonb NOT NULL DEFAULT '{"enabled":false,"employeeAmount":0,"employerAmount":0,"frequency":"yearly"}'::jsonb,
  notes text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.statutory_policies TO authenticated;
GRANT ALL ON public.statutory_policies TO service_role;

ALTER TABLE public.statutory_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members read statutory policies"
  ON public.statutory_policies FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.app_users WHERE auth_id = auth.uid() AND is_active = true));

CREATE POLICY "Tenant admins manage statutory policies"
  ON public.statutory_policies FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.app_users u WHERE u.auth_id = auth.uid() AND u.is_active = true AND u.role IN ('admin','super_admin') AND (u.tenant_id = statutory_policies.tenant_id OR u.role = 'super_admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.app_users u WHERE u.auth_id = auth.uid() AND u.is_active = true AND u.role IN ('admin','super_admin') AND (u.tenant_id = statutory_policies.tenant_id OR u.role = 'super_admin')));

CREATE UNIQUE INDEX IF NOT EXISTS idx_statutory_policies_tenant_effective
  ON public.statutory_policies (tenant_id, effective_from);

CREATE TRIGGER trg_statutory_policies_stamp_tenant
  BEFORE INSERT ON public.statutory_policies
  FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_id();

CREATE TRIGGER trg_statutory_policies_updated
  BEFORE UPDATE ON public.statutory_policies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();