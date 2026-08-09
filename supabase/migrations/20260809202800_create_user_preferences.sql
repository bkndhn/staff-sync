-- Create user_preferences table for Admin Isolation and LocalStorage Removal

CREATE TABLE IF NOT EXISTS public.user_preferences (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL DEFAULT (SELECT tenant_id FROM app_users WHERE auth_id = auth.uid()),
  user_id uuid NOT NULL DEFAULT (SELECT id FROM app_users WHERE auth_id = auth.uid()),
  key text NOT NULL,
  value jsonb NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(tenant_id, user_id, key)
);

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

-- Allow users to read only their own preferences within their tenant
CREATE POLICY "Users can view their own preferences"
ON public.user_preferences FOR SELECT
USING (
  tenant_id = (SELECT tenant_id FROM app_users WHERE auth_id = auth.uid()) 
  AND user_id = (SELECT id FROM app_users WHERE auth_id = auth.uid())
);

-- Allow users to insert their own preferences within their tenant
CREATE POLICY "Users can insert their own preferences"
ON public.user_preferences FOR INSERT
WITH CHECK (
  tenant_id = (SELECT tenant_id FROM app_users WHERE auth_id = auth.uid()) 
  AND user_id = (SELECT id FROM app_users WHERE auth_id = auth.uid())
);

-- Allow users to update their own preferences within their tenant
CREATE POLICY "Users can update their own preferences"
ON public.user_preferences FOR UPDATE
USING (
  tenant_id = (SELECT tenant_id FROM app_users WHERE auth_id = auth.uid()) 
  AND user_id = (SELECT id FROM app_users WHERE auth_id = auth.uid())
);

-- Allow users to delete their own preferences within their tenant
CREATE POLICY "Users can delete their own preferences"
ON public.user_preferences FOR DELETE
USING (
  tenant_id = (SELECT tenant_id FROM app_users WHERE auth_id = auth.uid()) 
  AND user_id = (SELECT id FROM app_users WHERE auth_id = auth.uid())
);
