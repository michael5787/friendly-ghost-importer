ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_path text;
CREATE POLICY "Signed-in users view avatars" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'avatars');
CREATE POLICY "Admins upload avatars" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'avatars' AND public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Admins update avatars" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'avatars' AND public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Admins delete avatars" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'avatars' AND public.has_role(auth.uid(), 'super_admin'));
