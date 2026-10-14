ALTER TABLE public.profiles ADD COLUMN created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
COMMENT ON COLUMN public.profiles.created_by IS 'Teacher who created this placeholder student account';

UPDATE public.profiles p
SET created_by = (u.raw_user_meta_data->>'created_by_teacher')::uuid
FROM auth.users u
WHERE u.id = p.id
  AND u.raw_user_meta_data->>'created_by_teacher' IS NOT NULL;

CREATE OR REPLACE FUNCTION public.create_placeholder_student(_first_name text, _last_name text, _class_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'extensions'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _is_admin boolean;
  _level uuid;
  _new_id uuid := gen_random_uuid();
  _email text;
  _full text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'غير مسجّل الدخول.'; END IF;
  _first_name := btrim(coalesce(_first_name, ''));
  _last_name := btrim(coalesce(_last_name, ''));
  IF _first_name = '' OR _last_name = '' OR length(_first_name) > 60 OR length(_last_name) > 60 THEN
    RAISE EXCEPTION 'الاسم واللقب مطلوبان.';
  END IF;
  _is_admin := public.has_role(_uid, 'super_admin');
  IF NOT _is_admin AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = _uid AND space = 'taleem' AND status = 'approved'
  ) THEN RAISE EXCEPTION 'حسابك ليس حساب أستاذ مُفعّل.'; END IF;
  IF NOT _is_admin AND NOT EXISTS (
    SELECT 1 FROM public.teacher_classes WHERE teacher_id = _uid AND class_id = _class_id
  ) THEN RAISE EXCEPTION 'أنت غير مُسنَد إلى هذا القسم.'; END IF;
  SELECT level_id INTO _level FROM public.classes WHERE id = _class_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'القسم غير موجود.'; END IF;

  _email := 'eleve-' || encode(gen_random_bytes(6), 'hex') || '@eleves.local';
  _full := _last_name || ' ' || _first_name;

  INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change)
  VALUES ('00000000-0000-0000-0000-000000000000', _new_id, 'authenticated', 'authenticated', _email,
    crypt(encode(gen_random_bytes(24), 'hex'), gen_salt('bf')),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('space', 'talameed', 'full_name', _full, 'created_by_teacher', _uid),
    now(), now(), '', '', '', '');

  UPDATE public.profiles
     SET full_name = _full, class_id = _class_id, level_id = _level, status = 'pending', created_by = _uid
   WHERE id = _new_id;

  RETURN jsonb_build_object('id', _new_id, 'email', _email, 'fullName', _full);
END;
$function$;
