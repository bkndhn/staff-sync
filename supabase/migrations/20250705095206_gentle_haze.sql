/*
  # Add initial_salary column to staff table

  1. Changes
    - Add `initial_salary` column to store first salary for hike tracking

  2. Security
    - No changes to RLS policies needed
*/

-- Add initial_salary column to staff table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'staff' AND column_name = 'initial_salary'
  ) THEN
    ALTER TABLE staff ADD COLUMN initial_salary integer;
  END IF;
END $$;