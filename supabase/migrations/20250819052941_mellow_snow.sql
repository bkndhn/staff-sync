/*
  # Fix RLS policy for old_staff_records table

  1. Security Updates
    - Drop existing restrictive policy
    - Add new policy allowing INSERT operations for all users (anon and authenticated)
    - This matches the pattern used in other tables like staff, attendance, advances
*/

-- Drop the existing restrictive policy
DROP POLICY IF EXISTS "Allow all operations on old_staff_records" ON old_staff_records;

-- Create a new policy that allows all operations for both anon and authenticated users
CREATE POLICY "Allow all operations on old_staff_records for all users"
  ON old_staff_records
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);