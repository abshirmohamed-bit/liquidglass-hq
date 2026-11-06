import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { YOUTUBE_CALLBACK_PATH } from "./youtube-rules";

const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** Start "Connect YouTube": returns the Google sign-in URL. */
export const startYouTubeConnect = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { authorizeUrl } = await import("./youtube.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const origin = new URL(getRequest().url).origin;
    const state = b64url(crypto.getRandomValues(new Uint8Array(24)));
    const owner = (await context.supabase.rpc("workspace_of", { _uid: context.userId })).data ?? context.userId;
    const { error } = await supabaseAdmin.from("oauth_states").insert({ state, user_id: context.userId, owner_id: owner, provider: "YOUTUBE", code_verifier: "", return_to: origin });
    if (error) throw new Error(error.message);
    return { url: authorizeUrl(state, `${origin}${YOUTUBE_CALLBACK_PATH}`) };
  });
