/*
  # Update RLS policy for advances table

  1. Security Changes
    - Drop existing restrictive policy on advances table
    - Add new policy allowing all operations for both anon and authenticated users
    - This matches the policy structure used by staff and attendance tables

  This change allows the application to perform INSERT and UPDATE operations
  on the advances table, resolving the RLS policy violation error.
*/

-- Drop the existing policy
DROP POLICY IF EXISTS "Allow all operations on advances" ON advances;

-- Create new policy that allows all operations for both anon and authenticated users
CREATE POLICY "Allow all operations on advances for all users"
  ON advances
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);