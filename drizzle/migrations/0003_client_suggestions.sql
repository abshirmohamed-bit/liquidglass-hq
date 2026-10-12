CREATE TABLE public.client_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('TITLES','IDEAS')),
  content jsonb NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, kind)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_suggestions TO authenticated;
GRANT ALL ON public.client_suggestions TO service_role;
ALTER TABLE public.client_suggestions ENABLE ROW LEVEL SECURITY;
CREATE POLICY suggestions_own ON public.client_suggestions FOR ALL TO authenticated
USING (owner_id = auth.uid())
WITH CHECK (owner_id = auth.uid() AND EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.owner_id = auth.uid()));