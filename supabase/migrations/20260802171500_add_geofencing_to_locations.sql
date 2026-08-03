-- Add Geofencing coordinates and radius to locations
ALTER TABLE public.locations
ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS radius_meters INTEGER DEFAULT 100;
