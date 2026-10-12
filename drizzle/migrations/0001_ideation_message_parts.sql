ALTER TABLE public.ideation_messages ADD COLUMN IF NOT EXISTS parts jsonb;
ALTER TABLE public.ideation_messages ADD COLUMN IF NOT EXISTS sdk_message_id text;
CREATE UNIQUE INDEX IF NOT EXISTS ideation_messages_sdk_id_idx ON public.ideation_messages(thread_id, sdk_message_id);
ALTER TABLE public.ideation_threads ADD COLUMN IF NOT EXISTS ai_block_reason text;
COMMENT ON COLUMN public.ideation_messages.parts IS 'Persisted AI SDK UIMessage parts, including streamed text and reasoning.';