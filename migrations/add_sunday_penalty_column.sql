-- Migration: Add sunday_penalty column to staff table
-- Date: 2025-11-30
-- Description: Adds sunday_penalty boolean column to track whether Sunday penalties should be applied to each staff member

-- Add the column with a default value of true
ALTER TABLE staff 
ADD COLUMN IF NOT EXISTS sunday_penalty BOOLEAN DEFAULT true;

-- Update any existing NULL values to true (for backward compatibility)
UPDATE staff 
SET sunday_penalty = true 
WHERE sunday_penalty IS NULL;

-- Verify the column was added
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'staff' AND column_name = 'sunday_penalty';
