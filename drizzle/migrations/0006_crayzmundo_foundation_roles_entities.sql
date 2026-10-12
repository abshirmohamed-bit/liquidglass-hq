-- ROLES
CREATE TYPE public.app_role AS ENUM ('ADMIN','CLIENT','CLIPPER');
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'CLIPPER',
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT public.has_role(_user_id, 'ADMIN') $$;
CREATE OR REPLACE FUNCTION public.my_client(_user_id uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT client_id FROM public.user_roles WHERE user_id = _user_id AND role = 'CLIENT' $$;

CREATE POLICY user_roles_read ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR (public.is_admin(auth.uid()) AND public.workspace_of(user_id) = public.workspace_of(auth.uid())));

CREATE OR REPLACE FUNCTION public.assign_default_role() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'CLIPPER') ON CONFLICT (user_id) DO NOTHING; RETURN NEW; END $$;
CREATE TRIGGER on_user_default_role AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.assign_default_role();

INSERT INTO public.user_roles(user_id, role)
SELECT u.id, CASE WHEN EXISTS (SELECT 1 FROM public.team_logins t WHERE t.user_id = u.id) THEN 'CLIPPER'::public.app_role ELSE 'ADMIN'::public.app_role END
FROM auth.users u ON CONFLICT (user_id) DO NOTHING;

-- EXISTING AGENCY TABLES: admin only (clients see their own Client row and analytics)
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['app_settings','client_progress','client_suggestions','daily_objectives','ideation_messages','ideation_threads','knowledge_entries','leads','payments','team_members','thumbnail_messages','thumbnail_sessions'] LOOP
    EXECUTE format('CREATE POLICY admin_only ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()))', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['clients','analytics_snapshots'] LOOP
    EXECUTE format('CREATE POLICY admin_write_ins ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()))', t);
    EXECUTE format('CREATE POLICY admin_write_upd ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()))', t);
    EXECUTE format('CREATE POLICY admin_write_del ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (public.is_admin(auth.uid()))', t);
  END LOOP;
END $$;
CREATE POLICY clients_read_scope ON public.clients AS RESTRICTIVE FOR SELECT TO authenticated USING (public.is_admin(auth.uid()) OR id = public.my_client(auth.uid()));
CREATE POLICY snapshots_read_scope ON public.analytics_snapshots AS RESTRICTIVE FOR SELECT TO authenticated USING (public.is_admin(auth.uid()) OR client_id = public.my_client(auth.uid()));

-- generic helpers
CREATE OR REPLACE FUNCTION public.ws_admin(_owner uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT _owner = public.workspace_of(auth.uid()) AND public.is_admin(auth.uid()) $$;

-- NEW ENTITIES
CREATE TABLE public.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(), created_by uuid NOT NULL DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  title text NOT NULL, brief text, rules text, platforms jsonb NOT NULL DEFAULT '[]', source_assets jsonb NOT NULL DEFAULT '[]',
  deadline timestamptz, pay_terms text, rate_per_thousand_views numeric, posting_time text,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','OPEN','CLOSED'))
);
CREATE TABLE public.campaign_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  clipper uuid NOT NULL DEFAULT auth.uid(), joined_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','REMOVED')),
  UNIQUE (campaign_id, clipper)
);
CREATE OR REPLACE FUNCTION public.campaign_client(_campaign uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT client_id FROM public.campaigns WHERE id = _campaign $$;
CREATE OR REPLACE FUNCTION public.campaign_open(_campaign uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT EXISTS (SELECT 1 FROM public.campaigns WHERE id = _campaign AND status = 'OPEN') $$;
CREATE OR REPLACE FUNCTION public.is_campaign_member(_campaign uuid, _uid uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT EXISTS (SELECT 1 FROM public.campaign_memberships WHERE campaign_id = _campaign AND clipper = _uid AND status = 'ACTIVE') $$;

CREATE TABLE public.source_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(), created_by uuid NOT NULL DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now(),
  name text NOT NULL, kind text NOT NULL CHECK (kind IN ('UPLOAD','LINK')), source_url text, engine_asset_id text,
  source_height numeric, quality_warning boolean NOT NULL DEFAULT false, public_url text, duration_ms bigint, size_bytes bigint,
  width integer, height integer, fps numeric, thumbnail_url text, transcript jsonb,
  transcript_status text NOT NULL DEFAULT 'NONE' CHECK (transcript_status IN ('NONE','PENDING','READY','FAILED')),
  subtitle_file_url text, niche text CHECK (niche IN ('POLITICS','RELIGION','ENTERTAINMENT','EDUCATION','OTHER')),
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL, campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'UPLOADING' CHECK (status IN ('UPLOADING','READY','FAILED','TRASHED')), trashed_at timestamptz, error text
);
CREATE TABLE public.clip_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(), created_by uuid NOT NULL DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now(),
  engine text NOT NULL DEFAULT 'NATIVE' CHECK (engine IN ('NATIVE')),
  source_asset_id uuid NOT NULL REFERENCES public.source_assets(id) ON DELETE CASCADE,
  coverage text NOT NULL DEFAULT 'BEST_MOMENTS' CHECK (coverage IN ('BEST_MOMENTS','WHOLE_VIDEO','DONT_CLIP')),
  clip_count jsonb, clip_length jsonb, range_start_ms bigint, range_end_ms bigint, genre text,
  mode text NOT NULL DEFAULT 'AUTO' CHECK (mode IN ('AUTO','SPEECH','ENERGY','VISUAL')), prompt text, must_include jsonb,
  headline_top_n integer, alternates boolean NOT NULL DEFAULT false,
  edit_level text CHECK (edit_level IN ('clips','captions','cropped','full')),
  aspect text CHECK (aspect IN ('9:16','1:1','4:5','16:9')), formats jsonb, framing text CHECK (framing IN ('AUTO','BOTH','CENTER')),
  language text, caption_language text, caption_style_id text, broll_asset_id text, music_asset_id text, edits jsonb,
  engine_job_id text, suggested_count integer,
  status text NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED','PROCESSING','AWAITING_CONFIRMATION','COMPLETED','FAILED')),
  stage text, progress numeric, processing_seconds numeric, last_event_id text, error text
);
CREATE TABLE public.formats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now(),
  key text NOT NULL, name text NOT NULL, description text, thumbnail_url text, inputs jsonb, recipe jsonb, active boolean NOT NULL DEFAULT true,
  UNIQUE (owner_id, key)
);
CREATE TABLE public.submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  clipper uuid NOT NULL DEFAULT auth.uid(), clip_id uuid NOT NULL, note text,
  status text NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN ('SUBMITTED','CHANGES_REQUESTED','APPROVED','REJECTED','POSTED')),
  reviewer_comment text, reviewed_by uuid, reviewed_at timestamptz, post_ids jsonb NOT NULL DEFAULT '[]'
);
CREATE TABLE public.clips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(), created_by uuid NOT NULL DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now(),
  job_id uuid REFERENCES public.clip_jobs(id) ON DELETE CASCADE, source_asset_id uuid REFERENCES public.source_assets(id) ON DELETE CASCADE,
  engine_project_id text, index integer, title text, start_ms bigint, end_ms bigint, duration_ms bigint, thumbnail_url text,
  score numeric, score_breakdown jsonb, scene_analysis text, reason text,
  alternate_of uuid REFERENCES public.clips(id) ON DELETE SET NULL,
  favorite boolean NOT NULL DEFAULT false, disliked boolean NOT NULL DEFAULT false, assignee uuid,
  status text NOT NULL DEFAULT 'FOUND' CHECK (status IN ('FOUND','APPROVED','REJECTED','EXPORTING','READY','FAILED')),
  engine_export_id text, video_url text, width integer, height integer, size_bytes bigint,
  resolution text CHECK (resolution IN ('HD','UHD')), aspect text, layout text, background jsonb, framing jsonb,
  caption_style_id text, caption_style jsonb, captions jsonb, caption_language text, caption_options jsonb,
  title_text text, title_style text, watermark_url text, watermark_text text, edits jsonb,
  overlays jsonb, audio_tracks jsonb, cuts jsonb, one_click_preset text, style_preset text, intensity text,
  dub_language text, dub_asset_url text, copy jsonb,
  format_id uuid REFERENCES public.formats(id) ON DELETE SET NULL, render_job_id uuid,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  submission_id uuid REFERENCES public.submissions(id) ON DELETE SET NULL,
  share_token text UNIQUE, last_event_id text, error text
);
ALTER TABLE public.submissions ADD CONSTRAINT submissions_clip_id_fkey FOREIGN KEY (clip_id) REFERENCES public.clips(id) ON DELETE CASCADE;
CREATE TABLE public.render_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(), created_by uuid NOT NULL DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now(),
  clip_id uuid REFERENCES public.clips(id) ON DELETE CASCADE, source_asset_id uuid REFERENCES public.source_assets(id) ON DELETE CASCADE,
  format_id uuid NOT NULL REFERENCES public.formats(id) ON DELETE CASCADE, inputs jsonb, engine_render_id text,
  status text NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED','RENDERING','READY','FAILED')),
  output_url text, duration_ms bigint, error text
);
ALTER TABLE public.clips ADD CONSTRAINT clips_render_job_id_fkey FOREIGN KEY (render_job_id) REFERENCES public.render_jobs(id) ON DELETE SET NULL;
CREATE TABLE public.brand_kits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(), user_id uuid NOT NULL DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now(),
  handle text, caption_style_id text, caption_style jsonb, colors jsonb, font_asset_ids jsonb, default_aspect text, default_layout text,
  tone text, banned_words text, proper_nouns text, censored_words text, cta_overlay_text text,
  logo_asset_id text, intro_asset_id text, outro_asset_id text, end_card boolean NOT NULL DEFAULT false, music_asset_id text,
  ai_toggles jsonb, copy_defaults jsonb
);
CREATE TABLE public.assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(), created_by uuid NOT NULL DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now(),
  type text NOT NULL CHECK (type IN ('VIDEO','IMAGE','AUDIO','FONT')), name text NOT NULL, url text, duration_ms bigint,
  source text CHECK (source IN ('UPLOAD','EXPORT','RENDER','VOICEOVER','IMAGE','MUSIC','SFX','BROLL','FONT','DUB')),
  tags jsonb NOT NULL DEFAULT '[]', license text, client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL, trashed_at timestamptz
);
CREATE TABLE public.channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(), user_id uuid NOT NULL DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now(),
  platform text NOT NULL CHECK (platform IN ('INSTAGRAM','YOUTUBE','TIKTOK','X','FACEBOOK','LINKEDIN')),
  handle text, external_account_id text,
  status text NOT NULL DEFAULT 'MANUAL' CHECK (status IN ('CONNECTED','EXPIRED','DISCONNECTED','MANUAL')),
  scopes text, privacy_default text, tiktok_target text CHECK (tiktok_target IN ('FEED','INBOX')), connected_at timestamptz, last_error text
);
CREATE TABLE public.channel_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  provider text, refresh_token text, access_token text, expires_at timestamptz
);
CREATE TABLE public.posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(), created_by uuid NOT NULL DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now(),
  clip_id uuid NOT NULL REFERENCES public.clips(id) ON DELETE CASCADE, channel_id uuid REFERENCES public.channels(id) ON DELETE SET NULL,
  platform text, title text, caption text, hashtags jsonb NOT NULL DEFAULT '[]', cover_time_ms bigint, privacy text,
  include_source_link boolean NOT NULL DEFAULT false, scheduled_at timestamptz,
  mode text NOT NULL DEFAULT 'AUTO' CHECK (mode IN ('AUTO','MANUAL')),
  status text NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED','POSTING','POSTED','FAILED','SKIPPED','AWAITING_MANUAL')),
  external_post_id text, post_url text, attempts integer NOT NULL DEFAULT 0, last_error text, posted_at timestamptz
);
CREATE TABLE public.post_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE, fetched_at timestamptz NOT NULL DEFAULT now(),
  views bigint, likes bigint, comments bigint, shares bigint
);
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(), user_id uuid NOT NULL,
  type text NOT NULL CHECK (type IN ('CLIPS_READY','CLIPS_AWAITING_COUNT','EXPORT_READY','EXPORT_FAILED','JOB_FAILED','RENDER_READY','DUB_READY','SUBMISSION_REVIEWED','POST_RESULT','MANUAL_POST_DUE')),
  title text NOT NULL, body text, link text, read boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid(), user_id uuid DEFAULT auth.uid(),
  action text NOT NULL, entity text, entity_id text, details jsonb, timestamp timestamptz NOT NULL DEFAULT now()
);

-- GRANTS
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaigns, public.campaign_memberships, public.source_assets, public.clip_jobs, public.formats, public.submissions, public.clips, public.render_jobs, public.brand_kits, public.assets, public.channels, public.posts, public.post_metrics, public.notifications TO authenticated;
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.campaigns, public.campaign_memberships, public.source_assets, public.clip_jobs, public.formats, public.submissions, public.clips, public.render_jobs, public.brand_kits, public.assets, public.channels, public.channel_credentials, public.posts, public.post_metrics, public.notifications, public.audit_logs TO service_role;

-- RLS
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.source_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clip_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.formats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.render_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_kits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['campaigns','campaign_memberships','source_assets','clip_jobs','formats','submissions','clips','render_jobs','brand_kits','assets','channels','posts','notifications','audit_logs'] LOOP
    EXECUTE format('CREATE TRIGGER set_workspace_owner BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_workspace_owner()', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['source_assets','clip_jobs','render_jobs','assets','posts'] LOOP
    EXECUTE format('CREATE POLICY own_rows ON public.%I FOR ALL TO authenticated USING (public.ws_admin(owner_id) OR (owner_id = public.workspace_of(auth.uid()) AND created_by = auth.uid())) WITH CHECK (public.ws_admin(owner_id) OR (owner_id = public.workspace_of(auth.uid()) AND created_by = auth.uid()))', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['brand_kits','channels'] LOOP
    EXECUTE format('CREATE POLICY own_rows ON public.%I FOR ALL TO authenticated USING (public.ws_admin(owner_id) OR (owner_id = public.workspace_of(auth.uid()) AND user_id = auth.uid())) WITH CHECK (public.ws_admin(owner_id) OR (owner_id = public.workspace_of(auth.uid()) AND user_id = auth.uid()))', t);
  END LOOP;
END $$;

CREATE POLICY campaigns_admin ON public.campaigns FOR ALL TO authenticated USING (public.ws_admin(owner_id)) WITH CHECK (public.ws_admin(owner_id));
CREATE POLICY campaigns_read ON public.campaigns FOR SELECT TO authenticated USING (owner_id = public.workspace_of(auth.uid()) AND (
  client_id = public.my_client(auth.uid())
  OR (public.has_role(auth.uid(),'CLIPPER') AND (status = 'OPEN' OR public.is_campaign_member(id, auth.uid())))));
CREATE POLICY memberships_admin ON public.campaign_memberships FOR ALL TO authenticated USING (public.ws_admin(owner_id)) WITH CHECK (public.ws_admin(owner_id));
CREATE POLICY memberships_own_read ON public.campaign_memberships FOR SELECT TO authenticated USING (clipper = auth.uid() OR public.campaign_client(campaign_id) = public.my_client(auth.uid()));
CREATE POLICY memberships_join ON public.campaign_memberships FOR INSERT TO authenticated WITH CHECK (clipper = auth.uid() AND public.has_role(auth.uid(),'CLIPPER') AND public.campaign_open(campaign_id) AND status = 'ACTIVE');
CREATE POLICY submissions_admin ON public.submissions FOR ALL TO authenticated USING (public.ws_admin(owner_id)) WITH CHECK (public.ws_admin(owner_id));
CREATE POLICY submissions_clipper ON public.submissions FOR ALL TO authenticated USING (clipper = auth.uid()) WITH CHECK (clipper = auth.uid() AND public.is_campaign_member(campaign_id, auth.uid()));
CREATE POLICY submissions_client_read ON public.submissions FOR SELECT TO authenticated USING (public.campaign_client(campaign_id) = public.my_client(auth.uid()));
CREATE POLICY submissions_client_review ON public.submissions FOR UPDATE TO authenticated USING (public.campaign_client(campaign_id) = public.my_client(auth.uid())) WITH CHECK (public.campaign_client(campaign_id) = public.my_client(auth.uid()));
CREATE POLICY clips_own ON public.clips FOR ALL TO authenticated USING (public.ws_admin(owner_id) OR (owner_id = public.workspace_of(auth.uid()) AND (created_by = auth.uid() OR assignee = auth.uid()))) WITH CHECK (public.ws_admin(owner_id) OR (owner_id = public.workspace_of(auth.uid()) AND (created_by = auth.uid() OR assignee = auth.uid())));
CREATE POLICY clips_client_read ON public.clips FOR SELECT TO authenticated USING (campaign_id IS NOT NULL AND public.campaign_client(campaign_id) = public.my_client(auth.uid()));
CREATE OR REPLACE FUNCTION public.clip_client(_clip uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT ca.client_id FROM public.clips c JOIN public.campaigns ca ON ca.id = c.campaign_id WHERE c.id = _clip $$;
CREATE POLICY posts_client_read ON public.posts FOR SELECT TO authenticated USING (public.clip_client(clip_id) = public.my_client(auth.uid()));
CREATE POLICY post_metrics_read ON public.post_metrics FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_metrics.post_id));
CREATE POLICY post_metrics_admin ON public.post_metrics FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_metrics.post_id AND public.ws_admin(p.owner_id))) WITH CHECK (EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_metrics.post_id AND public.ws_admin(p.owner_id)));
CREATE POLICY formats_read ON public.formats FOR SELECT TO authenticated USING (owner_id = public.workspace_of(auth.uid()));
CREATE POLICY formats_admin ON public.formats FOR ALL TO authenticated USING (public.ws_admin(owner_id)) WITH CHECK (public.ws_admin(owner_id));
CREATE POLICY notifications_own ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.ws_admin(owner_id));
CREATE POLICY notifications_mark ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY notifications_admin ON public.notifications FOR ALL TO authenticated USING (public.ws_admin(owner_id)) WITH CHECK (public.ws_admin(owner_id));
CREATE POLICY audit_admin_read ON public.audit_logs FOR SELECT TO authenticated USING (public.ws_admin(owner_id));
CREATE POLICY audit_insert_self ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.guard_submission_fields() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'CLIENT') THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.status := 'SUBMITTED'; NEW.reviewer_comment := NULL; NEW.reviewed_by := NULL; NEW.reviewed_at := NULL;
  ELSIF NEW.status IS DISTINCT FROM OLD.status OR NEW.reviewer_comment IS DISTINCT FROM OLD.reviewer_comment THEN
    RAISE EXCEPTION 'Clippers cannot change a submission''s status or reviewer comment';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_submission_fields BEFORE INSERT OR UPDATE ON public.submissions FOR EACH ROW EXECUTE FUNCTION public.guard_submission_fields();
CREATE OR REPLACE FUNCTION public.guard_post_status() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_admin(auth.uid()) THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN NEW.status := 'QUEUED';
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN RAISE EXCEPTION 'Only admins or the posting service can change a post''s status';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_post_status BEFORE INSERT OR UPDATE ON public.posts FOR EACH ROW EXECUTE FUNCTION public.guard_post_status();