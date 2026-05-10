-- Add salary_supplements column to staff table
ALTER TABLE staff 
ADD COLUMN IF NOT EXISTS salary_supplements JSONB DEFAULT '{}'::jsonb;

-- Update existing records to have empty object instead of null
UPDATE staff 
SET salary_supplements = '{}'::jsonb 
WHERE salary_supplements IS NULL;
