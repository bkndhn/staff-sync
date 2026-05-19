-- Add eSSL device connection config to locations table
ALTER TABLE public.locations
ADD COLUMN IF NOT EXISTS device_type text DEFAULT 'direct_tcp',
ADD COLUMN IF NOT EXISTS device_ip text,
ADD COLUMN IF NOT EXISTS device_port integer DEFAULT 4370,
ADD COLUMN IF NOT EXISTS db_connection_string text,
ADD COLUMN IF NOT EXISTS last_sync_time timestamptz;
