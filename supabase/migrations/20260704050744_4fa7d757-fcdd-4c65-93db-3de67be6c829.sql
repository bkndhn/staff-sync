
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS is_statutory boolean NOT NULL DEFAULT false;

UPDATE public.staff
  SET is_statutory = true
  WHERE is_statutory = false
    AND (
      (pf_number IS NOT NULL AND pf_number <> '')
      OR (esi_number IS NOT NULL AND esi_number <> '')
    );
