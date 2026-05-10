-- Add display_order column to staff table
ALTER TABLE staff
ADD COLUMN IF NOT EXISTS display_order INTEGER;

-- Initialize display_order for existing records based on name
WITH ordered_rows AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY name) as rn
  FROM staff
)
UPDATE staff
SET display_order = ordered_rows.rn
FROM ordered_rows
WHERE staff.id = ordered_rows.id;
