/*
  # Add arrival_time and leaving_time columns to attendance table

  1. Changes
    - Add `arrival_time` column (text type to store time in HH:MM format)
    - Add `leaving_time` column (text type to store time in HH:MM format)
    - Both columns are optional (nullable)

  2. Security
    - No changes to RLS policies needed
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'attendance' AND column_name = 'arrival_time'
  ) THEN
    ALTER TABLE attendance ADD COLUMN arrival_time text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'attendance' AND column_name = 'leaving_time'
  ) THEN
    ALTER TABLE attendance ADD COLUMN leaving_time text;
  END IF;
END $$;