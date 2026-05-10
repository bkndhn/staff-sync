/*
  # Add salary fields to attendance table

  1. Changes
    - Add `salary` column to store part-time daily salary
    - Add `salary_override` column to track if salary was manually edited

  2. Security
    - No changes to RLS policies needed
*/

-- Add salary fields to attendance table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'attendance' AND column_name = 'salary'
  ) THEN
    ALTER TABLE attendance ADD COLUMN salary integer;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'attendance' AND column_name = 'salary_override'
  ) THEN
    ALTER TABLE attendance ADD COLUMN salary_override boolean DEFAULT false;
  END IF;
END $$;