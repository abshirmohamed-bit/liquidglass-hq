CREATE TABLE public.oauth_states (
  state text PRIMARY KEY,
  user_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  provider text NOT NULL,
  code_verifier text NOT NULL,
  return_to text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.oauth_states TO service_role;
ALTER TABLE public.oauth_states ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX IF NOT EXISTS channel_credentials_channel_uidx ON public.channel_credentials(channel_id);
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS platform_options jsonb NOT NULL DEFAULT '{}'::jsonb;