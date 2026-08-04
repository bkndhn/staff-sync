-- Missing auth.identities records prevent migrated users from signing in.
-- This script ensures all migrated users get an email identity.
INSERT INTO auth.identities (
  id,
  user_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at,
  provider_id
)
SELECT
  gen_random_uuid(),
  id,
  jsonb_build_object('sub', id, 'email', email, 'email_verified', true),
  'email',
  now(),
  now(),
  now(),
  id::text
FROM auth.users
WHERE NOT EXISTS (
  SELECT 1 FROM auth.identities WHERE auth.identities.user_id = auth.users.id AND provider = 'email'
);
