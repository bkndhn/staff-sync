ALTER TABLE public.payroll_runs
  ADD COLUMN IF NOT EXISTS submitted_by text,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by text,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_by text,
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS total_net numeric,
  ADD COLUMN IF NOT EXISTS headcount integer;

CREATE TABLE IF NOT EXISTS public.tenant_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  plan text NOT NULL DEFAULT 'starter',
  billing_cycle text NOT NULL DEFAULT 'monthly',
  amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'INR',
  status text NOT NULL DEFAULT 'trial',
  trial_ends_at timestamptz,
  current_period_start timestamptz NOT NULL DEFAULT now(),
  current_period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id)
);

GRANT ALL ON public.tenant_subscriptions TO service_role;
ALTER TABLE public.tenant_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_subscriptions_service_role_only" ON public.tenant_subscriptions;
CREATE POLICY "tenant_subscriptions_service_role_only" ON public.tenant_subscriptions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER trg_tenant_subscriptions_updated
  BEFORE UPDATE ON public.tenant_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();