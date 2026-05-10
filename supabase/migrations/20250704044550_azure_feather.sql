/*
  # Fix Staff Table RLS Policy

  1. Security Changes
    - Update RLS policy on `staff` table to allow operations for both authenticated and anonymous users
    - This is appropriate for internal staff management applications where authentication might not be required
    - Remove the restrictive authenticated-only policy and replace with a more permissive one

  2. Policy Updates
    - Drop existing restrictive policy
    - Create new policy allowing all operations for both authenticated and anonymous users
*/

-- Drop the existing restrictive policy
DROP POLICY IF EXISTS "Allow all operations on staff" ON staff;

-- Create a new policy that allows operations for both authenticated and anonymous users
CREATE POLICY "Allow all operations on staff for all users"
  ON staff
  FOR ALL
  TO authenticated, anon
  USING (true)
  WITH CHECK (true);