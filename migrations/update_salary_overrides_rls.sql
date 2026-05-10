-- Drop existing policies if they exist (clean slate for this table)
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON salary_manual_overrides;
DROP POLICY IF EXISTS "Enable insert access for authenticated users" ON salary_manual_overrides;
DROP POLICY IF EXISTS "Enable update access for authenticated users" ON salary_manual_overrides;
DROP POLICY IF EXISTS "Enable delete access for authenticated users" ON salary_manual_overrides;

-- Create policies for ANON (public) access
-- Since the app handles auth internally, we trust the client for now (development mode)
-- Ideally, we would migrate to Supabase Auth, but for now we enable anon access.

CREATE POLICY "Enable read access for all users" ON salary_manual_overrides
    FOR SELECT USING (true);

CREATE POLICY "Enable insert access for all users" ON salary_manual_overrides
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Enable update access for all users" ON salary_manual_overrides
    FOR UPDATE USING (true);

CREATE POLICY "Enable delete access for all users" ON salary_manual_overrides
    FOR DELETE USING (true);
