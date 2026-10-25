ALTER TABLE public.punch_events ADD COLUMN IF NOT EXISTS photo_path text;
CREATE INDEX IF NOT EXISTS idx_punch_events_photo_created ON public.punch_events (created_at) WHERE photo_path IS NOT NULL;