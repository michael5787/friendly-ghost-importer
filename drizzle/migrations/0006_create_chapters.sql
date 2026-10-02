CREATE TABLE public.chapters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level_id uuid NOT NULL REFERENCES public.levels(id) ON DELETE CASCADE,
  name text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.chapters TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.chapters TO authenticated;
GRANT ALL ON public.chapters TO service_role;
ALTER TABLE public.chapters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read chapters" ON public.chapters FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins insert chapters" ON public.chapters FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Admins update chapters" ON public.chapters FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Admins delete chapters" ON public.chapters FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));
CREATE INDEX chapters_level_idx ON public.chapters(level_id, position);
CREATE TRIGGER update_chapters_updated_at BEFORE UPDATE ON public.chapters FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
ALTER TABLE public.resources ADD COLUMN IF NOT EXISTS chapter_id uuid REFERENCES public.chapters(id) ON DELETE SET NULL;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS chapter_id uuid REFERENCES public.chapters(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS resources_chapter_idx ON public.resources(chapter_id);
CREATE INDEX IF NOT EXISTS questions_chapter_idx ON public.questions(chapter_id);