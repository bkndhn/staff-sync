ALTER TABLE public.statutory_policies
ADD COLUMN IF NOT EXISTS leave jsonb NOT NULL DEFAULT '{}'::jsonb;