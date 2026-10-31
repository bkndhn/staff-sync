-- Timed phone alerts: per-company schedules (custom times, many per day, chosen roles)
CREATE TABLE public.alert_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  kind text NOT NULL,
  label text,
  enabled boolean NOT NULL DEFAULT true,
  audience_roles text[] NOT NULL DEFAULT '{admin,manager}',
  times text[] NOT NULL DEFAULT '{}',
  days integer[] NOT NULL DEFAULT '{0,1,2,3,4,5,6}',
  timing text NOT NULL DEFAULT 'fixed',
  offset_minutes integer NOT NULL DEFAULT 15,
  day_of_month integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.alert_schedules TO authenticated;
GRANT ALL ON public.alert_schedules TO service_role;
ALTER TABLE public.alert_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role manages alert schedules" ON public.alert_schedules
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "tenant admins manage alert schedules" ON public.alert_schedules
  FOR ALL TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.app_users WHERE auth_id = auth.uid() AND is_active AND role IN ('admin','manager')))
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.app_users WHERE auth_id = auth.uid() AND is_active AND role IN ('admin','manager')));

CREATE INDEX alert_schedules_tenant_idx ON public.alert_schedules (tenant_id) WHERE enabled;

CREATE OR REPLACE FUNCTION public.validate_alert_schedule()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE t text;
BEGIN
  IF NEW.kind NOT IN ('attendance_summary','mark_attendance','punch_in_reminder','punch_out_reminder','salary_prep','leave_pending') THEN
    RAISE EXCEPTION 'Unknown alert type %', NEW.kind;
  END IF;
  IF NEW.timing NOT IN ('fixed','before_shift') THEN RAISE EXCEPTION 'Unknown timing %', NEW.timing; END IF;
  IF NEW.timing = 'before_shift' AND NEW.kind NOT IN ('punch_in_reminder','punch_out_reminder') THEN
    RAISE EXCEPTION 'Before-shift timing is only for punch reminders';
  END IF;
  IF NEW.offset_minutes < 0 OR NEW.offset_minutes > 240 THEN RAISE EXCEPTION 'Reminder must be 0-240 minutes before shift'; END IF;
  IF coalesce(array_length(NEW.times, 1), 0) > 12 THEN RAISE EXCEPTION 'At most 12 times per alert'; END IF;
  FOREACH t IN ARRAY NEW.times LOOP
    IF t !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN RAISE EXCEPTION 'Invalid time %', t; END IF;
  END LOOP;
  IF NEW.day_of_month IS NOT NULL AND (NEW.day_of_month < 1 OR NEW.day_of_month > 31) THEN
    RAISE EXCEPTION 'Day of month must be 1-31';
  END IF;
  IF NOT (NEW.audience_roles <@ ARRAY['admin','manager','supervisor','floor_supervisor','statutory_admin','petty_cash_manager']) THEN
    RAISE EXCEPTION 'Unknown role in audience';
  END IF;
  NEW.label := left(NEW.label, 80);
  NEW.updated_at := now();
  RETURN NEW;
END $$;

CREATE TRIGGER alert_schedules_validate BEFORE INSERT OR UPDATE ON public.alert_schedules
  FOR EACH ROW EXECUTE FUNCTION public.validate_alert_schedule();

-- One send per schedule per time slot (stops repeats when the timer fires again)
CREATE TABLE public.alert_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  schedule_id uuid NOT NULL REFERENCES public.alert_schedules(id) ON DELETE CASCADE,
  slot_key text NOT NULL,
  recipients integer NOT NULL DEFAULT 0,
  pushed integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (schedule_id, slot_key)
);
GRANT ALL ON public.alert_runs TO service_role;
ALTER TABLE public.alert_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "No direct browser access to alert runs" ON public.alert_runs
  AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

-- Company-wide on/off for "punched in / out" phone alerts
ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS punch_alerts_enabled boolean NOT NULL DEFAULT true;

-- Per-phone mute list (e.g. a staff member turns off punch alerts or reminders on their phone)
ALTER TABLE public.fcm_tokens
  ADD COLUMN IF NOT EXISTS muted text[] NOT NULL DEFAULT '{}';