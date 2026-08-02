-- Ensure app_sessions table exists
CREATE TABLE IF NOT EXISTS public.app_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    token TEXT NOT NULL UNIQUE,
    role TEXT,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    is_valid BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS and allow service role full access
ALTER TABLE public.app_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service role full access on app_sessions" ON public.app_sessions;
CREATE POLICY "service role full access on app_sessions" ON public.app_sessions FOR ALL USING (true) WITH CHECK (true);

-- Index for fast token lookup
CREATE INDEX IF NOT EXISTS idx_app_sessions_token ON public.app_sessions(token);
CREATE INDEX IF NOT EXISTS idx_app_sessions_user_id ON public.app_sessions(user_id);

-- Ensure super admin user has correct role and no tenant_id
UPDATE public.app_users 
SET role = 'super_admin', tenant_id = NULL, is_active = true
WHERE email = 'app@superadmin.com';

-- Ensure super_admin_role column exists (safe to re-run)
ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS super_admin_role TEXT;
