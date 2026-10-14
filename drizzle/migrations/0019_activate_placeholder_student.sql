-- Un enseignant active lui-même un élève qu'il a ajouté (classe dont il a la charge)
-- en lui donnant un vrai e-mail et un mot de passe : le compte devient « مقبول ».
CREATE OR REPLACE FUNCTION public.activate_placeholder_student(_student_id uuid, _email text, _password text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'غير مسجّل الدخول.'; END IF;
  IF NOT public.can_manage_placeholder_student(_student_id) THEN
    RAISE EXCEPTION 'لا يمكنك تفعيل هذا التلميذ.';
  END IF;

  _email := lower(btrim(coalesce(_email, '')));
  IF _email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR _email LIKE '%@eleves.local' THEN
    RAISE EXCEPTION 'البريد الإلكتروني غير صالح.';
  END IF;
  IF length(coalesce(_password, '')) < 6 OR length(_password) > 72 THEN
    RAISE EXCEPTION 'كلمة المرور يجب أن تتكوّن من 6 أحرف على الأقل.';
  END IF;
  IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = _email AND id <> _student_id)
     OR EXISTS (SELECT 1 FROM public.profiles WHERE lower(email) = _email AND id <> _student_id) THEN
    RAISE EXCEPTION 'هذا البريد الإلكتروني مستعمل من طرف حساب آخر.';
  END IF;

  UPDATE auth.users
     SET email = _email,
         encrypted_password = crypt(_password, gen_salt('bf')),
         email_confirmed_at = coalesce(email_confirmed_at, now()),
         updated_at = now()
   WHERE id = _student_id;

  -- Identité « email » nécessaire à la connexion par mot de passe.
  BEGIN
    DELETE FROM auth.identities WHERE user_id = _student_id AND provider = 'email';
    INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    VALUES (_student_id::text, _student_id,
            jsonb_build_object('sub', _student_id::text, 'email', _email, 'email_verified', true),
            'email', now(), now(), now());
  EXCEPTION WHEN others THEN
    NULL; -- schéma d'identités différent : la connexion par e-mail reste possible via auth.users
  END;

  UPDATE public.profiles
     SET email = _email, status = 'approved', reviewed_at = now()
   WHERE id = _student_id;

  RETURN jsonb_build_object('id', _student_id, 'email', _email);
END;
$$;
REVOKE ALL ON FUNCTION public.activate_placeholder_student(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activate_placeholder_student(uuid, text, text) TO authenticated;
