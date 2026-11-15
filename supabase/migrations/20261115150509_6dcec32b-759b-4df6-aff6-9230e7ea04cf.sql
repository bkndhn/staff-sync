CREATE TABLE public.builtin_alert_sends (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  slot_key text NOT NULL,
  recipient text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, slot_key, recipient)
);
GRANT ALL ON public.builtin_alert_sends TO service_role;
ALTER TABLE public.builtin_alert_sends ENABLE ROW LEVEL SECURITY;