-- Cours complets par chapitre et niveau (PDF / Word), déposés par les enseignants.
CREATE TABLE IF NOT EXISTS public.course_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  level_id uuid NOT NULL REFERENCES public.levels(id) ON DELETE CASCADE,
  chapter_id uuid REFERENCES public.chapters(id) ON DELETE SET NULL,
  title text NOT NULL,
  file_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS course_files_level_chapter_idx ON public.course_files (level_id, chapter_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.course_files TO authenticated;
GRANT ALL ON public.course_files TO service_role;
ALTER TABLE public.course_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read course files" ON public.course_files;
CREATE POLICY "Authenticated read course files" ON public.course_files
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Teachers insert own course files" ON public.course_files;
CREATE POLICY "Teachers insert own course files" ON public.course_files
  FOR INSERT TO authenticated WITH CHECK (teacher_id = auth.uid());
DROP POLICY IF EXISTS "Teachers update own course files" ON public.course_files;
CREATE POLICY "Teachers update own course files" ON public.course_files
  FOR UPDATE TO authenticated USING (teacher_id = auth.uid()) WITH CHECK (teacher_id = auth.uid());
DROP POLICY IF EXISTS "Owner or admin delete course files" ON public.course_files;
CREATE POLICY "Owner or admin delete course files" ON public.course_files
  FOR DELETE TO authenticated USING (teacher_id = auth.uid() OR public.has_role(auth.uid(), 'super_admin'));

-- Stockage privé : chaque enseignant écrit dans son dossier <uid>/...
INSERT INTO storage.buckets (id, name, public)
VALUES ('course-files', 'course-files', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Authenticated read course storage" ON storage.objects;
CREATE POLICY "Authenticated read course storage" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'course-files');
DROP POLICY IF EXISTS "Teachers upload own course storage" ON storage.objects;
CREATE POLICY "Teachers upload own course storage" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'course-files' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS "Teachers delete own course storage" ON storage.objects;
CREATE POLICY "Teachers delete own course storage" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'course-files' AND (storage.foldername(name))[1] = auth.uid()::text);
