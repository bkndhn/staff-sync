
-- 1. Revoke direct SELECT on app_users from anon role to prevent password_hash exposure
-- Drop the overly permissive SELECT policy
DROP POLICY IF EXISTS "Allow public read for login" ON app_users;

-- Create a secure view that excludes password_hash
CREATE OR REPLACE VIEW app_users_public AS
  SELECT id, email, full_name, role, location, location_id, is_active, last_login, created_at, updated_at
  FROM app_users;

-- Allow anon to read from the safe view (no password_hash)
GRANT SELECT ON app_users_public TO anon, authenticated;

-- Add a restricted SELECT policy on the underlying table only for service role
-- anon users can no longer query app_users directly; they use app_users_public view
CREATE POLICY "Service role only select on app_users"
  ON app_users
  FOR SELECT
  USING (auth.role() = 'service_role');

-- 2. Fix part_time_advance_tracking - use consistent anon access pattern
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON part_time_advance_tracking;
DROP POLICY IF EXISTS "Enable all access for all users" ON part_time_advance_tracking;

CREATE POLICY "Allow anon access on part_time_advance_tracking"
  ON part_time_advance_tracking
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- 3. Fix part_time_settlements - use consistent anon access pattern
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON part_time_settlements;
DROP POLICY IF EXISTS "Enable all access for all users" ON part_time_settlements;

CREATE POLICY "Allow anon access on part_time_settlements"
  ON part_time_settlements
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);
