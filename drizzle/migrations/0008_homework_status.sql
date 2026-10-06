CREATE TABLE IF NOT EXISTS public.homework_status (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  homework_id uuid NOT NULL REFERENCES public.agenda_events(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  done boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (homework_id, student_id)
);
CREATE INDEX IF NOT EXISTS homework_status_student_idx ON public.homework_status (student_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.homework_status TO authenticated;
GRANT ALL ON public.homework_status TO service_role;
ALTER TABLE public.homework_status ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER update_homework_status_updated_at BEFORE UPDATE ON public.homework_status
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE POLICY "Read homework status" ON public.homework_status FOR SELECT TO authenticated
USING (
  auth.uid() = student_id OR auth.uid() = teacher_id
  OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  OR EXISTS (SELECT 1 FROM public.agenda_events e JOIN public.teacher_classes tc ON tc.class_id = e.class_id
             WHERE e.id = homework_status.homework_id AND tc.teacher_id = auth.uid())
);
CREATE POLICY "Teachers write homework status" ON public.homework_status FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = teacher_id AND (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR EXISTS (SELECT 1 FROM public.agenda_events e JOIN public.teacher_classes tc ON tc.class_id = e.class_id
               WHERE e.id = homework_status.homework_id AND e.kind = 'homework' AND tc.teacher_id = auth.uid())
  )
);
CREATE POLICY "Teachers update homework status" ON public.homework_status FOR UPDATE TO authenticated
USING (auth.uid() = teacher_id OR public.has_role(auth.uid(), 'super_admin'::public.app_role))
WITH CHECK (auth.uid() = teacher_id OR public.has_role(auth.uid(), 'super_admin'::public.app_role));
CREATE POLICY "Teachers delete homework status" ON public.homework_status FOR DELETE TO authenticated
USING (auth.uid() = teacher_id OR public.has_role(auth.uid(), 'super_admin'::public.app_role));