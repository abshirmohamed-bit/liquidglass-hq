CREATE TABLE public.daily_objectives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  text text NOT NULL CHECK (char_length(text) BETWEEN 1 AND 500),
  day date NOT NULL DEFAULT current_date,
  done boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_objectives TO authenticated;
GRANT ALL ON public.daily_objectives TO service_role;
ALTER TABLE public.daily_objectives ENABLE ROW LEVEL SECURITY;
CREATE POLICY objectives_own ON public.daily_objectives FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());