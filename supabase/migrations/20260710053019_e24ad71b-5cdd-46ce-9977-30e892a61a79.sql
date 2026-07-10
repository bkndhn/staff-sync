ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS password_hash text,
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS password_updated_at timestamptz;

COMMENT ON COLUMN public.staff.password_hash IS 'bcrypt hash of staff-chosen password. NULL means staff still uses joined_date (DDMMYYYY) as password on first login.';
COMMENT ON COLUMN public.staff.must_change_password IS 'True when staff must set a new password on next login (fresh account or admin reset).';