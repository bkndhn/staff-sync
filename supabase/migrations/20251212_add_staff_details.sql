-- Migration to add contact details and photo to staff table
ALTER TABLE staff ADD COLUMN contact_number TEXT;
ALTER TABLE staff ADD COLUMN address TEXT;
ALTER TABLE staff ADD COLUMN photo_url TEXT;

-- Migration to add contact details and photo to old_staff_records table
ALTER TABLE old_staff_records ADD COLUMN contact_number TEXT;
ALTER TABLE old_staff_records ADD COLUMN address TEXT;
ALTER TABLE old_staff_records ADD COLUMN photo_url TEXT;
