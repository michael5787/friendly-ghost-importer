-- المراقبة المستمرة : note de comportement (السلوك) ------------------------------
-- الجدية في القسم و العناية بالكراريس — une note /20 par élève et par enseignant.
CREATE TABLE IF NOT EXISTS public.behavior_grades (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  grade numeric(5,2) NOT NULL CHECK (grade >= 0 AND grade <= 20),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, teacher_id)
);
CREATE INDEX IF NOT EXISTS behavior_grades_student_idx ON public.behavior_grades (student_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.behavior_grades TO authenticated;
GRANT ALL ON public.behavior_grades TO service_role;
ALTER TABLE public.behavior_grades ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS update_behavior_grades_updated_at ON public.behavior_grades;
CREATE TRIGGER update_behavior_grades_updated_at
BEFORE UPDATE ON public.behavior_grades
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP POLICY IF EXISTS "Read behavior grades" ON public.behavior_grades;
CREATE POLICY "Read behavior grades" ON public.behavior_grades FOR SELECT TO authenticated
USING (
  auth.uid() = student_id OR auth.uid() = teacher_id
  OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  OR EXISTS (SELECT 1 FROM public.teacher_classes tc
             WHERE tc.class_id = behavior_grades.class_id AND tc.teacher_id = auth.uid())
);
DROP POLICY IF EXISTS "Teachers write behavior grades" ON public.behavior_grades;
CREATE POLICY "Teachers write behavior grades" ON public.behavior_grades FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = teacher_id AND (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR EXISTS (SELECT 1 FROM public.teacher_classes tc
               WHERE tc.class_id = behavior_grades.class_id AND tc.teacher_id = auth.uid())
  )
);
DROP POLICY IF EXISTS "Teachers update behavior grades" ON public.behavior_grades;
CREATE POLICY "Teachers update behavior grades" ON public.behavior_grades FOR UPDATE TO authenticated
USING (auth.uid() = teacher_id OR public.has_role(auth.uid(), 'super_admin'::public.app_role))
WITH CHECK (auth.uid() = teacher_id OR public.has_role(auth.uid(), 'super_admin'::public.app_role));
DROP POLICY IF EXISTS "Teachers delete behavior grades" ON public.behavior_grades;
CREATE POLICY "Teachers delete behavior grades" ON public.behavior_grades FOR DELETE TO authenticated
USING (auth.uid() = teacher_id OR public.has_role(auth.uid(), 'super_admin'::public.app_role));
