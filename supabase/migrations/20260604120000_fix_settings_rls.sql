-- Add full access policies for locations, floors, and designations to anon and authenticated

-- Locations
DROP POLICY IF EXISTS "Enable insert access for all users" ON locations;
DROP POLICY IF EXISTS "Enable update access for all users" ON locations;
DROP POLICY IF EXISTS "Enable delete access for all users" ON locations;
DROP POLICY IF EXISTS "Enable read access for all users" ON locations;
DROP POLICY IF EXISTS "Allow public access to locations" ON locations;
DROP POLICY IF EXISTS "Allow anon read access to locations" ON locations;

CREATE POLICY "Allow all operations for anon and authenticated users on locations"
  ON locations
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Floors
DROP POLICY IF EXISTS "Enable insert access for all users" ON floors;
DROP POLICY IF EXISTS "Enable update access for all users" ON floors;
DROP POLICY IF EXISTS "Enable delete access for all users" ON floors;
DROP POLICY IF EXISTS "Enable read access for all users" ON floors;
DROP POLICY IF EXISTS "Allow public access to floors" ON floors;
DROP POLICY IF EXISTS "Allow anon read access to floors" ON floors;

CREATE POLICY "Allow all operations for anon and authenticated users on floors"
  ON floors
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Designations
DROP POLICY IF EXISTS "Enable insert access for all users" ON designations;
DROP POLICY IF EXISTS "Enable update access for all users" ON designations;
DROP POLICY IF EXISTS "Enable delete access for all users" ON designations;
DROP POLICY IF EXISTS "Enable read access for all users" ON designations;
DROP POLICY IF EXISTS "Allow public access to designations" ON designations;
DROP POLICY IF EXISTS "Allow anon read access to designations" ON designations;

CREATE POLICY "Allow all operations for anon and authenticated users on designations"
  ON designations
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);
