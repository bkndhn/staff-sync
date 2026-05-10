
-- Face embeddings table
CREATE TABLE public.face_embeddings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  staff_id TEXT NOT NULL,
  staff_name TEXT,
  angle_label TEXT NOT NULL DEFAULT 'front',
  descriptor JSONB NOT NULL,
  descriptor_dim INTEGER NOT NULL DEFAULT 0,
  image_path TEXT,
  quality_score NUMERIC,
  is_approved BOOLEAN NOT NULL DEFAULT true,
  captured_by TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_face_embeddings_staff ON public.face_embeddings(staff_id);
CREATE INDEX idx_face_embeddings_approved ON public.face_embeddings(is_approved);

ALTER TABLE public.face_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to face_embeddings"
ON public.face_embeddings FOR ALL
TO anon, authenticated
USING (true) WITH CHECK (true);

-- Registration audit log
CREATE TABLE public.face_registration_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  staff_id TEXT NOT NULL,
  embedding_id UUID,
  action TEXT NOT NULL,
  actor TEXT,
  reason TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_face_logs_staff ON public.face_registration_logs(staff_id);

ALTER TABLE public.face_registration_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to face_registration_logs"
ON public.face_registration_logs FOR ALL
TO anon, authenticated
USING (true) WITH CHECK (true);

-- updated_at trigger function (reuse if already exists)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_face_embeddings_updated_at
BEFORE UPDATE ON public.face_embeddings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Private storage bucket for reference images
INSERT INTO storage.buckets (id, name, public)
VALUES ('face-samples', 'face-samples', false)
ON CONFLICT (id) DO NOTHING;

-- Permissive bucket policies (match app's custom-auth model)
CREATE POLICY "face-samples read all"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'face-samples');

CREATE POLICY "face-samples insert all"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'face-samples');

CREATE POLICY "face-samples update all"
ON storage.objects FOR UPDATE
TO anon, authenticated
USING (bucket_id = 'face-samples');

CREATE POLICY "face-samples delete all"
ON storage.objects FOR DELETE
TO anon, authenticated
USING (bucket_id = 'face-samples');
