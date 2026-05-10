/*
  # Fix attendance table RLS policy

  1. Security Changes
    - Update the attendance table policy to allow operations for both anonymous and authenticated users
    - This matches the staff table policy and allows the application to work with the anon key

  2. Changes Made
    - Drop the existing restrictive policy
    - Create a new policy that allows all operations for both anon and authenticated roles
*/

-- Drop the existing restrictive policy
DROP POLICY IF EXISTS "Allow all operations on attendance" ON attendance;

-- Create a new policy that allows operations for both anon and authenticated users
CREATE POLICY "Allow all operations on attendance for all users"
  ON attendance
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);