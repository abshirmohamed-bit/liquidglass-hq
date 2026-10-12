ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'READY' CHECK (status IN ('UPLOADING','READY','FAILED','TRASHED'));
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS error text;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS size_bytes bigint;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS engine_asset_id text;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;