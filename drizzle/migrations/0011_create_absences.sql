CREATE TABLE public.absences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  teacher_id uuid NOT NULL,
  class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  reason text,
  justified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT absences_range CHECK (end_date >= start_date),
  CONSTRAINT absences_reason_len CHECK (reason IS NULL OR char_length(reason) <= 200)
);
CREATE INDEX absences_student_idx ON public.absences(student_id, start_date DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.absences TO authenticated;
GRANT ALL ON public.absences TO service_role;
ALTER TABLE public.absences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Students view own absences" ON public.absences FOR SELECT TO authenticated
  USING (student_id = auth.uid() OR teacher_id = auth.uid() OR public.teaches_student(auth.uid(), student_id) OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Teachers add absences" ON public.absences FOR INSERT TO authenticated
  WITH CHECK (teacher_id = auth.uid() AND (public.teaches_student(auth.uid(), student_id) OR public.has_role(auth.uid(), 'super_admin')));
CREATE POLICY "Teachers update own absences" ON public.absences FOR UPDATE TO authenticated
  USING (teacher_id = auth.uid() OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Teachers delete own absences" ON public.absences FOR DELETE TO authenticated
  USING (teacher_id = auth.uid() OR public.has_role(auth.uid(), 'super_admin'));
