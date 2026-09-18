-- Fichiers de questions/réponses : premier dossier = class_id
CREATE POLICY "Read question files of own class"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'questions'
  AND (
    owner = auth.uid()
    OR public.has_role(auth.uid(), 'super_admin')
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.class_id::text = (storage.foldername(name))[1]
    )
    OR EXISTS (
      SELECT 1 FROM public.teacher_classes tc
      WHERE tc.teacher_id = auth.uid() AND tc.class_id::text = (storage.foldername(name))[1]
    )
  )
);

CREATE POLICY "Upload question files in own class"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'questions'
  AND (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.class_id::text = (storage.foldername(name))[1]
    )
    OR EXISTS (
      SELECT 1 FROM public.teacher_classes tc
      WHERE tc.teacher_id = auth.uid() AND tc.class_id::text = (storage.foldername(name))[1]
    )
  )
);

CREATE POLICY "Delete own question files"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'questions'
  AND (owner = auth.uid() OR public.has_role(auth.uid(), 'super_admin'))
);
