ALTER TABLE public.staff_fingerprints
  ADD COLUMN IF NOT EXISTS public_key text,
  ADD COLUMN IF NOT EXISTS sign_count bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS transports text[],
  ADD COLUMN IF NOT EXISTS verified_at timestamptz;

CREATE TABLE public.fingerprint_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  staff_id uuid NOT NULL,
  purpose text NOT NULL,
  challenge text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.fingerprint_challenges TO service_role;
ALTER TABLE public.fingerprint_challenges ENABLE ROW LEVEL SECURITY;
CREATE INDEX fingerprint_challenges_staff_idx ON public.fingerprint_challenges (staff_id, created_at DESC);