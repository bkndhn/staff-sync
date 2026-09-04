CREATE TABLE IF NOT EXISTS public.staff_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  staff_id uuid,
  app_user_id uuid,
  type text NOT NULL DEFAULT 'general',
  title text NOT NULL,
  message text,
  action_url text,
  tab_id text,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.staff_notifications TO authenticated;
GRANT ALL ON public.staff_notifications TO service_role;
ALTER TABLE public.staff_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service role manages staff notifications" ON public.staff_notifications;
CREATE POLICY "service role manages staff notifications"
ON public.staff_notifications FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "tenant members read staff notifications" ON public.staff_notifications;
CREATE POLICY "tenant members read staff notifications"
ON public.staff_notifications FOR SELECT TO authenticated
USING (tenant_id IN (SELECT tenant_id FROM public.app_users WHERE auth_id = auth.uid() AND is_active = true));

DROP POLICY IF EXISTS "tenant admins update staff notifications" ON public.staff_notifications;
CREATE POLICY "tenant admins update staff notifications"
ON public.staff_notifications FOR UPDATE TO authenticated
USING (tenant_id IN (SELECT tenant_id FROM public.app_users WHERE auth_id = auth.uid() AND is_active = true))
WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.app_users WHERE auth_id = auth.uid() AND is_active = true));

CREATE INDEX IF NOT EXISTS idx_staff_notifications_staff ON public.staff_notifications(staff_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_staff_notifications_tenant ON public.staff_notifications(tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
  daily_attendance_enabled boolean NOT NULL DEFAULT false,
  daily_attendance_time time NOT NULL DEFAULT '19:00',
  timezone text NOT NULL DEFAULT 'Asia/Kolkata',
  uninformed_leave_enabled boolean NOT NULL DEFAULT true,
  salary_credit_enabled boolean NOT NULL DEFAULT true,
  last_daily_sent_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.notification_preferences TO authenticated;
GRANT ALL ON public.notification_preferences TO service_role;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service role manages notification preferences" ON public.notification_preferences;
CREATE POLICY "service role manages notification preferences"
ON public.notification_preferences FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "tenant admins manage notification preferences" ON public.notification_preferences;
CREATE POLICY "tenant admins manage notification preferences"
ON public.notification_preferences FOR ALL TO authenticated
USING (tenant_id IN (SELECT tenant_id FROM public.app_users WHERE auth_id = auth.uid() AND is_active = true AND role IN ('admin','manager')))
WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.app_users WHERE auth_id = auth.uid() AND is_active = true AND role IN ('admin','manager')));

CREATE TRIGGER trg_notification_preferences_updated
BEFORE UPDATE ON public.notification_preferences
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  category text NOT NULL,
  audience text NOT NULL DEFAULT 'staff',
  staff_id uuid,
  app_user_id uuid,
  title text NOT NULL,
  body text,
  action_url text,
  status text NOT NULL DEFAULT 'sent',
  push_count integer NOT NULL DEFAULT 0,
  error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.notification_log TO authenticated;
GRANT ALL ON public.notification_log TO service_role;
ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service role manages notification log" ON public.notification_log;
CREATE POLICY "service role manages notification log"
ON public.notification_log FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "tenant admins read notification log" ON public.notification_log;
CREATE POLICY "tenant admins read notification log"
ON public.notification_log FOR SELECT TO authenticated
USING (tenant_id IN (SELECT tenant_id FROM public.app_users WHERE auth_id = auth.uid() AND is_active = true AND role IN ('admin','manager')));

CREATE INDEX IF NOT EXISTS idx_notification_log_tenant ON public.notification_log(tenant_id, created_at DESC);

CREATE TRIGGER trg_staff_notifications_stamp_tenant
BEFORE INSERT ON public.staff_notifications
FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_id();

CREATE TRIGGER trg_notification_log_stamp_tenant
BEFORE INSERT ON public.notification_log
FOR EACH ROW EXECUTE FUNCTION public.stamp_tenant_id();