CREATE TABLE public.team_logins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  email text NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (owner_id <> user_id)
);
GRANT SELECT ON public.team_logins TO authenticated;
GRANT ALL ON public.team_logins TO service_role;
ALTER TABLE public.team_logins ENABLE ROW LEVEL SECURITY;
CREATE POLICY team_logins_read ON public.team_logins FOR SELECT TO authenticated USING (owner_id = auth.uid() OR user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.workspace_of(_uid uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT owner_id FROM public.team_logins WHERE user_id = _uid), _uid)
$$;
REVOKE EXECUTE ON FUNCTION public.workspace_of(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.workspace_of(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_workspace_owner() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN NEW.owner_id := public.workspace_of(auth.uid()); END IF;
  RETURN NEW;
END $$;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['app_settings','client_suggestions','clients','daily_objectives','ideation_threads','knowledge_entries','leads'] LOOP
    EXECUTE format('CREATE TRIGGER set_workspace_owner BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_workspace_owner()', t);
  END LOOP;
END $$;

DROP POLICY settings_own ON public.app_settings;
CREATE POLICY settings_own ON public.app_settings FOR ALL TO authenticated USING (owner_id = public.workspace_of(auth.uid())) WITH CHECK (owner_id = public.workspace_of(auth.uid()));
DROP POLICY clients_own ON public.clients;
CREATE POLICY clients_own ON public.clients FOR ALL TO authenticated USING (owner_id = public.workspace_of(auth.uid())) WITH CHECK (owner_id = public.workspace_of(auth.uid()));
DROP POLICY objectives_own ON public.daily_objectives;
CREATE POLICY objectives_own ON public.daily_objectives FOR ALL TO authenticated USING (owner_id = public.workspace_of(auth.uid())) WITH CHECK (owner_id = public.workspace_of(auth.uid()));
DROP POLICY leads_own ON public.leads;
CREATE POLICY leads_own ON public.leads FOR ALL TO authenticated USING (owner_id = public.workspace_of(auth.uid())) WITH CHECK (owner_id = public.workspace_of(auth.uid()));
DROP POLICY suggestions_own ON public.client_suggestions;
CREATE POLICY suggestions_own ON public.client_suggestions FOR ALL TO authenticated USING (owner_id = public.workspace_of(auth.uid())) WITH CHECK (owner_id = public.workspace_of(auth.uid()) AND EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.owner_id = public.workspace_of(auth.uid())));
DROP POLICY threads_own ON public.ideation_threads;
CREATE POLICY threads_own ON public.ideation_threads FOR ALL TO authenticated USING (owner_id = public.workspace_of(auth.uid())) WITH CHECK (owner_id = public.workspace_of(auth.uid()) AND (client_id IS NULL OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.owner_id = public.workspace_of(auth.uid()))));
DROP POLICY knowledge_own ON public.knowledge_entries;
CREATE POLICY knowledge_own ON public.knowledge_entries FOR ALL TO authenticated USING (owner_id = public.workspace_of(auth.uid())) WITH CHECK (owner_id = public.workspace_of(auth.uid()) AND (client_id IS NULL OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.owner_id = public.workspace_of(auth.uid()))));

DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT * FROM (VALUES ('analytics_snapshots','snapshots_own'),('client_progress','progress_own'),('payments','payments_own'),('team_members','team_members_own'),('thumbnail_sessions','sessions_own')) v(t,p) LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.p, r.t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = %I.client_id AND c.owner_id = public.workspace_of(auth.uid()))) WITH CHECK (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = %I.client_id AND c.owner_id = public.workspace_of(auth.uid())))', r.p, r.t, r.t, r.t);
  END LOOP;
END $$;
DROP POLICY thumbnail_messages_own ON public.thumbnail_messages;
CREATE POLICY thumbnail_messages_own ON public.thumbnail_messages FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.thumbnail_sessions s JOIN public.clients c ON c.id = s.client_id WHERE s.id = thumbnail_messages.session_id AND c.owner_id = public.workspace_of(auth.uid()))) WITH CHECK (EXISTS (SELECT 1 FROM public.thumbnail_sessions s JOIN public.clients c ON c.id = s.client_id WHERE s.id = thumbnail_messages.session_id AND c.owner_id = public.workspace_of(auth.uid())));
DROP POLICY messages_own ON public.ideation_messages;
CREATE POLICY messages_own ON public.ideation_messages FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.ideation_threads t WHERE t.id = ideation_messages.thread_id AND t.owner_id = public.workspace_of(auth.uid()))) WITH CHECK (EXISTS (SELECT 1 FROM public.ideation_threads t WHERE t.id = ideation_messages.thread_id AND t.owner_id = public.workspace_of(auth.uid())));