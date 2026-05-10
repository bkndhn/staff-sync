ALTER TABLE public.staff
ADD COLUMN IF NOT EXISTS statutory_deductions JSONB DEFAULT '{}'::jsonb;

UPDATE public.staff SET statutory_deductions = '{}'::jsonb WHERE statutory_deductions IS NULL;