-- Migration: Add salary_calculation_days column to staff table
-- Date: 2025-11-30
-- Description: Adds salary_calculation_days integer column to track the number of days to use for salary calculations (for prorated salaries)

-- Add the column with a default value of 30
ALTER TABLE staff 
ADD COLUMN IF NOT EXISTS salary_calculation_days INTEGER DEFAULT 30;

-- Update any existing NULL values to 30 (for backward compatibility)
UPDATE staff 
SET salary_calculation_days = 30 
WHERE salary_calculation_days IS NULL;

-- Verify the column was added
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'staff' AND column_name = 'salary_calculation_days';
