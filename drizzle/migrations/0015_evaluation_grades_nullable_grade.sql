ALTER TABLE public.evaluation_grades ALTER COLUMN grade DROP NOT NULL;
ALTER TABLE public.evaluation_grades DROP CONSTRAINT IF EXISTS evaluation_grades_grade_check;
ALTER TABLE public.evaluation_grades ADD CONSTRAINT evaluation_grades_grade_check CHECK (grade IS NULL OR (grade >= 0 AND grade <= 20));
COMMENT ON COLUMN public.evaluation_grades.grade IS 'NULL = note non déterminée (لم يحدد بعد) : élève pas encore dans la classe.';
