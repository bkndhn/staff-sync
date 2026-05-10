ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS meal_allowance_threshold INTEGER DEFAULT 0;
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS staff_accommodation TEXT DEFAULT '';
UPDATE public.staff SET meal_allowance_threshold = 0 WHERE meal_allowance_threshold IS NULL;
UPDATE public.staff SET staff_accommodation = '' WHERE staff_accommodation IS NULL;