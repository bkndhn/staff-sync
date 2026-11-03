-- 1) Verified password-recovery requests (staff starts, manager approves in person)
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS reset_request_hash text,
  ADD COLUMN IF NOT EXISTS reset_request_code_hash text,
  ADD COLUMN IF NOT EXISTS reset_request_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS reset_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS reset_approved_by text;

CREATE INDEX IF NOT EXISTS staff_reset_request_hash_idx ON public.staff (reset_request_hash) WHERE reset_request_hash IS NOT NULL;

-- Old manager-issued PINs are no longer accepted; clear any left over.
UPDATE public.staff SET reset_pin = NULL, reset_pin_expires_at = NULL WHERE reset_pin IS NOT NULL OR reset_pin_expires_at IS NOT NULL;

-- 2) Neutralise the seeded default super-administrator sign-in.
-- The original seed used a published password. Replace it with a random,
-- unknown value, block the account and end any sessions. The real super admin
-- (linked through app_users.auth_id) is never touched.
DO $$
DECLARE
  v_id uuid;
BEGIN
  SELECT u.id INTO v_id
  FROM auth.users u
  WHERE u.email = 'app@superadmin.com'
    AND NOT EXISTS (SELECT 1 FROM public.app_users a WHERE a.auth_id = u.id);

  IF v_id IS NOT NULL THEN
    UPDATE auth.users
      SET encrypted_password = extensions.crypt(encode(extensions.gen_random_bytes(48), 'hex'), extensions.gen_salt('bf')),
          banned_until = '2999-12-31 00:00:00+00'
      WHERE id = v_id;
    DELETE FROM auth.sessions WHERE user_id = v_id;
    DELETE FROM auth.refresh_tokens WHERE user_id = v_id::text;
  END IF;
END $$;