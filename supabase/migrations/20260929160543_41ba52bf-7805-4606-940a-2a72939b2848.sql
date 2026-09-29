ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS reset_pin text, ADD COLUMN IF NOT EXISTS reset_pin_expires_at timestamptz;
NOTIFY pgrst, 'reload schema';