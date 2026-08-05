ALTER TABLE public.device_status ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS device_status_select_policy ON public.device_status;
DROP POLICY IF EXISTS device_status_service_policy ON public.device_status;

REVOKE ALL ON public.device_status FROM anon, authenticated;
GRANT ALL ON public.device_status TO service_role;

CREATE POLICY device_status_service_role_all ON public.device_status
  FOR ALL TO service_role USING (true) WITH CHECK (true);