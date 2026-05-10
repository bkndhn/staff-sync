
-- =============================================
-- SECURITY HARDENING: Remove overly permissive RLS policies
-- =============================================

-- 1. CRITICAL: Lock down app_users table
DROP POLICY IF EXISTS "Allow authenticated insert" ON app_users;
DROP POLICY IF EXISTS "Allow authenticated update" ON app_users;
DROP POLICY IF EXISTS "Allow authenticated delete" ON app_users;

CREATE POLICY "Service role only insert on app_users" ON app_users
    FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY "Service role only update on app_users" ON app_users
    FOR UPDATE TO service_role USING (true);

CREATE POLICY "Service role only delete on app_users" ON app_users
    FOR DELETE TO service_role USING (true);

-- 2. Remove duplicate/overlapping anon write policies on locations
DROP POLICY IF EXISTS "Enable insert access for all users" ON locations;
DROP POLICY IF EXISTS "Enable update access for all users" ON locations;
DROP POLICY IF EXISTS "Enable delete access for all users" ON locations;
DROP POLICY IF EXISTS "Enable read access for all users" ON locations;
DROP POLICY IF EXISTS "Allow public access to locations" ON locations;

CREATE POLICY "Allow anon read access to locations" ON locations
    FOR SELECT TO anon USING (true);

-- 3. Add anon read for salary_categories (staff portal)
DROP POLICY IF EXISTS "Allow anon read salary_categories" ON salary_categories;
CREATE POLICY "Allow anon read salary_categories" ON salary_categories
    FOR SELECT TO anon USING (true);

-- 4. Create leave_requests table for leave management
CREATE TABLE IF NOT EXISTS leave_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id uuid NOT NULL,
    staff_name text NOT NULL,
    location text NOT NULL,
    leave_date date NOT NULL,
    leave_end_date date,
    leave_type text NOT NULL DEFAULT 'casual' CHECK (leave_type IN ('casual', 'sick', 'personal', 'emergency', 'other')),
    reason text NOT NULL,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'postponed')),
    manager_comment text,
    reviewed_by text,
    reviewed_at timestamptz,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to leave_requests" ON leave_requests
    FOR ALL TO anon, authenticated
    USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_leave_requests_staff ON leave_requests(staff_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_location ON leave_requests(location);
CREATE INDEX IF NOT EXISTS idx_leave_requests_status ON leave_requests(status);
CREATE INDEX IF NOT EXISTS idx_leave_requests_date ON leave_requests(leave_date);
