import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Reading a pasted link before any work starts (Engine POST /v1/analyze).
 * Nothing downloads here — this is only what the preview card and the
 * pre-filled options panel need.
 */
export type LinkDetails = {
  url: string;
  title: string;
  channel: string;
  duration_ms: number;
  duration_s: number;
  thumbnail_url: string;
  quality: string;
  best_height: number;
  fps: number;
  resolutions: number[];
  subtitle_languages: string[];
  language: string;
  chapters: { title: string; start_ms: number; end_ms: number }[];
  needs_rights: boolean;
  quality_warning: boolean;
  suggested: {
    clip_count: number;
    clip_length: string;
    use_existing_subtitles: boolean;
    language: string;
    rights_confirmation_required: boolean;
  };
};

export const analyzeLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ url: z.string().trim().min(4).max(2000) }))
  .handler(async ({ data }): Promise<LinkDetails> => {
    const { engineClient } = await import("./engine.server");
    const r = await engineClient<LinkDetails>("POST", "/v1/analyze", { url: data.url });
    if (!r.ok) throw new Error(r.error.message);
    return r.data;
  });
