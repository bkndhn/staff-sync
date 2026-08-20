-- Migration: Add reset_pin and reset_pin_expires_at to staff table

ALTER TABLE public.staff
ADD COLUMN reset_pin TEXT,
ADD COLUMN reset_pin_expires_at TIMESTAMPTZ;

-- Ensure these columns are accessible by RLS
-- Since admins already have UPDATE access to the staff table, this will just work.
