
-- Relax role check to include 'supervisor'
ALTER TABLE public.app_users DROP CONSTRAINT IF EXISTS app_users_role_check;
ALTER TABLE public.app_users ADD CONSTRAINT app_users_role_check
  CHECK (role IN ('admin', 'manager', 'staff', 'statutory_admin', 'supervisor'));

-- Floor binding for supervisors (nullable for other roles)
ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS floor text;
ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS floor_id uuid;
