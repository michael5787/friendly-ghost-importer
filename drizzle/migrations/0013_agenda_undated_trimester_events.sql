ALTER TABLE public.agenda_events ALTER COLUMN event_date DROP NOT NULL;
ALTER TABLE public.agenda_events ADD COLUMN trimester text;
ALTER TABLE public.agenda_events ADD CONSTRAINT agenda_events_trimester_check CHECK (trimester IS NULL OR trimester IN ('1','2','3'));
COMMENT ON COLUMN public.agenda_events.event_date IS 'NULL = évaluation par défaut non programmée (cachée des élèves jusqu''à attribution d''une date)';
