
-- Per-staff shift window override (nullable -> falls back to global)
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS shift_window jsonb;

-- Seed default global shift windows if missing
INSERT INTO public.app_settings (key, value)
VALUES (
  'shift_windows',
  '{"Morning":{"start":"10:00","end":"14:00","graceLateMin":15,"graceEarlyMin":15,"minHoursFull":4,"minHoursHalf":2},"Evening":{"start":"14:00","end":"21:00","graceLateMin":15,"graceEarlyMin":15,"minHoursFull":6,"minHoursHalf":3},"Both":{"start":"10:00","end":"21:00","graceLateMin":20,"graceEarlyMin":20,"minHoursFull":8,"minHoursHalf":4}}'
)
ON CONFLICT (key) DO NOTHING;
