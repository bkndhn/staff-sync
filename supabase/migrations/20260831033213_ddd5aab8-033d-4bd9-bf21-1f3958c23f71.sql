ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS email TEXT;

CREATE TABLE IF NOT EXISTS public.payslip_access_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_key TEXT NOT NULL UNIQUE,
  attempts INTEGER NOT NULL DEFAULT 0,
  failures INTEGER NOT NULL DEFAULT 0,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  blocked_until TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.payslip_access_attempts TO service_role;
ALTER TABLE public.payslip_access_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only on payslip_access_attempts"
  ON public.payslip_access_attempts FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_payslip_access_attempts_key ON public.payslip_access_attempts(client_key);

DROP TRIGGER IF EXISTS trg_payslip_access_attempts_updated ON public.payslip_access_attempts;
CREATE TRIGGER trg_payslip_access_attempts_updated BEFORE UPDATE ON public.payslip_access_attempts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_payslip_links_staff_period ON public.payslip_links(staff_id, year, month);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'staff_notifications') THEN
    ALTER TABLE public.staff_notifications DROP CONSTRAINT IF EXISTS staff_notifications_type_check;
    ALTER TABLE public.staff_notifications ADD CONSTRAINT staff_notifications_type_check
      CHECK (type IN ('leave_approved','leave_rejected','salary_generated','grievance_resolved','regularization_approved','regularization_rejected','letter_ready','profile_approved','profile_rejected','announcement','general','payslip_ready','compliance_ready'));
  END IF;
END $$;