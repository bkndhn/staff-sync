-- Add auth_id mapping to app_users
ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS auth_id UUID REFERENCES auth.users(id);

-- Add statutory credentials to app_settings (tenant scoped)
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS statutory_login_details JSONB DEFAULT '{}'::jsonb;

-- Import existing app_users into native Supabase auth.users using their existing bcrypt hashes
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  recovery_sent_at,
  last_sign_in_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
)
SELECT 
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  email,
  password_hash,
  now(), -- Auto-confirm existing users
  now(),
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', full_name, 'role', role),
  created_at,
  updated_at,
  '',
  '',
  '',
  ''
FROM public.app_users
WHERE NOT EXISTS (
  SELECT 1 FROM auth.users WHERE auth.users.email = public.app_users.email
);

-- Link the newly created auth.users back to app_users
UPDATE public.app_users
SET auth_id = (SELECT id FROM auth.users WHERE auth.users.email = public.app_users.email)
WHERE auth_id IS NULL;
