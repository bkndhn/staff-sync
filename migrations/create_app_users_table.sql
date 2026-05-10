-- Create dedicated app_users table for login authentication
-- This is separate from user_profiles to avoid conflicts

CREATE TABLE IF NOT EXISTS app_users (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    email text UNIQUE NOT NULL,
    password_hash text NOT NULL,
    full_name text NOT NULL,
    role text NOT NULL CHECK (role IN ('admin', 'manager')),
    location text,
    location_id uuid,
    is_active boolean DEFAULT true,
    last_login timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_app_users_email ON app_users(email);
CREATE INDEX IF NOT EXISTS idx_app_users_active ON app_users(is_active);
CREATE INDEX IF NOT EXISTS idx_app_users_role ON app_users(role);

-- Enable Row Level Security
ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;

-- RLS Policies (allow all operations for authenticated access)
CREATE POLICY "Allow public read for login" ON app_users
    FOR SELECT USING (true);

CREATE POLICY "Allow authenticated insert" ON app_users
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow authenticated update" ON app_users
    FOR UPDATE USING (true);

CREATE POLICY "Allow authenticated delete" ON app_users
    FOR DELETE USING (true);

-- IMPORTANT: Default admin user should be created via the auth-create-user Edge Function
-- which properly bcrypt-hashes the password. Do NOT store plaintext or weak hashes here.
-- To set up the initial admin, use the Edge Function or Supabase dashboard.
-- Example (run once via Edge Function):
--   POST /functions/v1/auth-create-user { "email": "admin@staffmanagement.com", "password": "<strong-password>", "full_name": "Administrator", "role": "admin" }
