-- Add super_admin_role column to app_users
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS super_admin_role text;
-- Add a check constraint to restrict the values for super_admin_role
ALTER TABLE app_users ADD CONSTRAINT app_users_super_admin_role_check 
  CHECK (super_admin_role IS NULL OR super_admin_role IN ('owner', 'billing', 'support'));
  
-- Default existing super_admins to 'owner'
UPDATE app_users SET super_admin_role = 'owner' WHERE role = 'super_admin' AND super_admin_role IS NULL;
