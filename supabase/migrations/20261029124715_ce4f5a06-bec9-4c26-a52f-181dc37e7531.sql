CREATE TABLE public.fcm_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  staff_id uuid,
  app_user_id uuid,
  token text NOT NULL UNIQUE,
  platform text NOT NULL DEFAULT 'web',
  device_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.fcm_tokens TO service_role;
ALTER TABLE public.fcm_tokens ENABLE ROW LEVEL SECURITY;
CREATE INDEX fcm_tokens_staff_idx ON public.fcm_tokens (tenant_id, staff_id);
CREATE INDEX fcm_tokens_user_idx ON public.fcm_tokens (tenant_id, app_user_id);