ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_path text;
DROP POLICY IF EXISTS "Signed-in users view avatars" ON storage.objects;
CREATE POLICY "Signed-in users view avatars" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'avatars');
DROP POLICY IF EXISTS "Admins upload avatars" ON storage.objects;
CREATE POLICY "Admins upload avatars" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'avatars' AND public.has_role(auth.uid(), 'super_admin'));
DROP POLICY IF EXISTS "Admins update avatars" ON storage.objects;
CREATE POLICY "Admins update avatars" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'avatars' AND public.has_role(auth.uid(), 'super_admin'));
DROP POLICY IF EXISTS "Admins delete avatars" ON storage.objects;
CREATE POLICY "Admins delete avatars" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'avatars' AND public.has_role(auth.uid(), 'super_admin'));
