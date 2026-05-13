-- =====================================================================
-- Migration: Location-wise Attendance Shift Config
-- Run this in your Supabase SQL Editor
-- =====================================================================

-- 1. Location shift config table
CREATE TABLE IF NOT EXISTS public.location_shift_config (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_name               TEXT NOT NULL,
  shift_start                 TEXT NOT NULL DEFAULT '09:00',   -- HH:MM 24h
  shift_end                   TEXT NOT NULL DEFAULT '18:00',   -- HH:MM 24h
  grace_late_min              INTEGER NOT NULL DEFAULT 15,
  grace_early_min             INTEGER NOT NULL DEFAULT 15,
  min_hours_full              NUMERIC(4,1) NOT NULL DEFAULT 8,
  min_hours_half              NUMERIC(4,1) NOT NULL DEFAULT 4,
  morning_cutoff              TEXT NOT NULL DEFAULT '12:00',   -- entries before this = Full Day eligible
  early_exit_time             TEXT NOT NULL DEFAULT '16:00',   -- if OUT before this = flip to Half Day
  full_day_requires_morning   BOOLEAN NOT NULL DEFAULT true,   -- must arrive before morning_cutoff for Full Day
  allow_manager_override      BOOLEAN NOT NULL DEFAULT true,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT location_shift_config_location_name_key UNIQUE (location_name)
);

-- 2. RLS
ALTER TABLE public.location_shift_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage location_shift_config"
  ON public.location_shift_config
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 3. Auto-update updated_at
CREATE OR REPLACE FUNCTION public.handle_location_shift_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_location_shift_updated
  BEFORE UPDATE ON public.location_shift_config
  FOR EACH ROW EXECUTE PROCEDURE public.handle_location_shift_updated_at();

-- 4. Add new keys to app_settings (upsert so it's idempotent)
INSERT INTO public.app_settings (key, value)
VALUES
  ('manager_can_override', 'true'),
  ('kiosk_match_threshold', '0.45'),
  ('anti_spoof_level', 'strict'),
  ('kiosk_morning_cutoff', '12:00'),
  ('kiosk_early_exit_time', '16:00'),
  ('kiosk_full_day_requires_morning', 'true')
ON CONFLICT (key) DO NOTHING;
