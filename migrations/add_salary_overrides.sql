-- Add override columns to advances table
ALTER TABLE advances
ADD COLUMN IF NOT EXISTS basic_override NUMERIC,
ADD COLUMN IF NOT EXISTS incentive_override NUMERIC,
ADD COLUMN IF NOT EXISTS hra_override NUMERIC,
ADD COLUMN IF NOT EXISTS sunday_penalty_override NUMERIC;
