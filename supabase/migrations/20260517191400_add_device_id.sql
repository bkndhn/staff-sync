-- Add device_id for hardware binding
ALTER TABLE staff ADD COLUMN IF NOT EXISTS device_id text;
