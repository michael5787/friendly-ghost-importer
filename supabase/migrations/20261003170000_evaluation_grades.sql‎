-- المراقبة المستمرة : notes des évaluations ------------------------------------
CREATE TABLE IF NOT EXISTS public.evaluation_grades (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  evaluation_id uuid NOT NULL REFERENCES public.agenda_events(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  grade numeric(5,2) NOT NULL CHECK (grade >= 0 AND grade <= 20),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (evaluation_id, student_id)
);
CREATE INDEX IF NOT EXISTS evaluation_grades_student_idx ON public.evaluation_grades (student_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.evaluation_grades TO authenticated;
GRANT ALL ON public.evaluation_grades TO service_role;
ALTER TABLE public.evaluation_grades ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_evaluation_grades_updated_at ON public.evaluation_grades;
CREATE TRIGGER update_evaluation_grades_updated_at
BEFORE UPDATE ON public.evaluation_grades
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP POLICY IF EXISTS "Read grades" ON public.evaluation_grades;
CREATE POLICY "Read grades" ON public.evaluation_grades FOR SELECT TO authenticated
USING (
  auth.uid() = student_id OR auth.uid() = teacher_id
  OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  OR EXISTS (SELECT 1 FROM public.agenda_events e JOIN public.teacher_classes tc ON tc.class_id = e.class_id
             WHERE e.id = evaluation_grades.evaluation_id AND tc.teacher_id = auth.uid())
);
DROP POLICY IF EXISTS "Teachers write grades" ON public.evaluation_grades;
CREATE POLICY "Teachers write grades" ON public.evaluation_grades FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = teacher_id AND (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR EXISTS (SELECT 1 FROM public.agenda_events e JOIN public.teacher_classes tc ON tc.class_id = e.class_id
               WHERE e.id = evaluation_grades.evaluation_id AND e.kind = 'evaluation' AND tc.teacher_id = auth.uid())
  )
);
DROP POLICY IF EXISTS "Teachers update grades" ON public.evaluation_grades;
CREATE POLICY "Teachers update grades" ON public.evaluation_grades FOR UPDATE TO authenticated
USING (auth.uid() = teacher_id OR public.has_role(auth.uid(), 'super_admin'::public.app_role))
WITH CHECK (auth.uid() = teacher_id OR public.has_role(auth.uid(), 'super_admin'::public.app_role));
DROP POLICY IF EXISTS "Teachers delete grades" ON public.evaluation_grades;
CREATE POLICY "Teachers delete grades" ON public.evaluation_grades FOR DELETE TO authenticated
USING (auth.uid() = teacher_id OR public.has_role(auth.uid(), 'super_admin'::public.app_role));
