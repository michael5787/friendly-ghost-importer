-- Allow users to see names of classmates and of teachers of their class
-- (needed to display question/answer author names in the class Q&A space).

CREATE OR REPLACE FUNCTION public.shares_class(_viewer uuid, _target uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles v
    JOIN public.profiles t ON t.class_id = v.class_id
    WHERE v.id = _viewer AND t.id = _target AND v.class_id IS NOT NULL
  )
  OR EXISTS (
    SELECT 1
    FROM public.profiles v
    JOIN public.teacher_classes tc ON tc.class_id = v.class_id
    WHERE v.id = _viewer AND tc.teacher_id = _target AND v.class_id IS NOT NULL
  )
$$;

REVOKE EXECUTE ON FUNCTION public.shares_class(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.shares_class(uuid, uuid) TO authenticated;

CREATE POLICY "Classmates and class teachers read profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (public.shares_class(auth.uid(), id));