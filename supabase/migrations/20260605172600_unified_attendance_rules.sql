-- 1. Add attendance settings columns to designations
ALTER TABLE designations 
  ADD COLUMN IF NOT EXISTS shift_start text DEFAULT '09:00',
  ADD COLUMN IF NOT EXISTS shift_end text DEFAULT '18:00',
  ADD COLUMN IF NOT EXISTS grace_late_min integer DEFAULT 15,
  ADD COLUMN IF NOT EXISTS grace_early_min integer DEFAULT 15,
  ADD COLUMN IF NOT EXISTS min_hours_full numeric DEFAULT 8,
  ADD COLUMN IF NOT EXISTS min_hours_half numeric DEFAULT 4,
  ADD COLUMN IF NOT EXISTS morning_cutoff text DEFAULT '12:00',
  ADD COLUMN IF NOT EXISTS early_exit_time text DEFAULT '16:00',
  ADD COLUMN IF NOT EXISTS evening_verification_time text DEFAULT '18:00',
  ADD COLUMN IF NOT EXISTS full_day_requires_morning boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS late_deduction_rate numeric DEFAULT 0.5,
  ADD COLUMN IF NOT EXISTS early_deduction_rate numeric DEFAULT 0.5;

-- 2. Create location_designation_shift_config table
CREATE TABLE IF NOT EXISTS location_designation_shift_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_name text NOT NULL,
  designation_id uuid NOT NULL REFERENCES designations(id) ON DELETE CASCADE,
  shift_start text,
  shift_end text,
  grace_late_min integer,
  grace_early_min integer,
  min_hours_full numeric,
  min_hours_half numeric,
  morning_cutoff text,
  early_exit_time text,
  evening_verification_time text,
  full_day_requires_morning boolean,
  late_deduction_rate numeric,
  early_deduction_rate numeric,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (location_name, designation_id)
);

-- Enable Row Level Security (RLS) for the new override table
ALTER TABLE location_designation_shift_config ENABLE ROW LEVEL SECURITY;

-- Create policy allowing full access for authenticated and anonymous roles
DROP POLICY IF EXISTS "Allow all operations for anon and authenticated users on location_designation_shift_config" ON location_designation_shift_config;
CREATE POLICY "Allow all operations for anon and authenticated users on location_designation_shift_config"
  ON location_designation_shift_config FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 3. Add exempt_from_late_deduction flag to staff table
ALTER TABLE staff 
  ADD COLUMN IF NOT EXISTS exempt_from_late_deduction boolean DEFAULT false;

-- 4. Add audit trail columns to attendance table
ALTER TABLE attendance 
  ADD COLUMN IF NOT EXISTS applied_rule_type text,
  ADD COLUMN IF NOT EXISTS applied_rule_details jsonb;
