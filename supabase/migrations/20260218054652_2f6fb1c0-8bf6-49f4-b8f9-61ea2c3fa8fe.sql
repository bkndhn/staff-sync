
-- Create app_sessions table for server-side session token validation
CREATE TABLE IF NOT EXISTS public.app_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  token TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + INTERVAL '30 days'),
  is_valid BOOLEAN NOT NULL DEFAULT true
);

-- Enable RLS - only service role can access sessions
ALTER TABLE public.app_sessions ENABLE ROW LEVEL SECURITY;

-- Only service role can read/write sessions (edge functions use service role key)
CREATE POLICY "Service role only on app_sessions"
ON public.app_sessions
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Index for fast token lookups
CREATE INDEX IF NOT EXISTS idx_app_sessions_token ON public.app_sessions(token);
CREATE INDEX IF NOT EXISTS idx_app_sessions_user_id ON public.app_sessions(user_id);
