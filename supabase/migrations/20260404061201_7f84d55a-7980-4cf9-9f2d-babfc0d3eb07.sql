ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS allowance_calc_modes JSONB DEFAULT '{}'::jsonb;
UPDATE public.staff SET allowance_calc_modes = '{}'::jsonb WHERE allowance_calc_modes IS NULL;