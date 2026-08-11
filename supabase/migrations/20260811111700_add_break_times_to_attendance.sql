-- Add break times to attendance table
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS break_time_out time without time zone;
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS break_time_in time without time zone;
