-- 1. Convert all empty string contact numbers to NULL
UPDATE public.staff 
SET contact_number = NULL 
WHERE contact_number = '';

-- 2. Safely remove duplicates by keeping only the most recently updated record's phone number
-- and setting the rest to NULL.
UPDATE public.staff
SET contact_number = NULL
WHERE id IN (
  SELECT id
  FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY contact_number ORDER BY updated_at DESC) as row_num
    FROM public.staff
    WHERE contact_number IS NOT NULL
  ) duplicates
  WHERE duplicates.row_num > 1
);

-- 3. Now apply the global UNIQUE constraint safely
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'staff_contact_number_key'
    ) THEN
        -- Drop index if it was created manually without a constraint
        DROP INDEX IF EXISTS staff_contact_number_key;
        
        ALTER TABLE public.staff 
        ADD CONSTRAINT staff_contact_number_key UNIQUE (contact_number);
    END IF;
END $$;
