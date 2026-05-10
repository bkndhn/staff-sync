-- Migration to add breakdown column to salary_hikes table
-- This allows storing the exact component-wise salary state after each hike.

ALTER TABLE IF EXISTS salary_hikes 
ADD COLUMN IF NOT EXISTS breakdown JSONB DEFAULT '{}'::jsonb;

-- Optional: Update existing records with an empty jsonb object if needed
UPDATE salary_hikes SET breakdown = '{}'::jsonb WHERE breakdown IS NULL;
