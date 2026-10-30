import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { TIKTOK_CALLBACK_PATH } from "./tiktok-rules";

const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** Start "Connect TikTok": returns the TikTok sign-in URL. */
export const startTikTokConnect = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { authorizeUrl } = await import("./tiktok.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const origin = new URL(getRequest().url).origin;
    const state = b64url(crypto.getRandomValues(new Uint8Array(24)));
    const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
    const challenge = b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
    const owner = (await context.supabase.rpc("workspace_of", { _uid: context.userId })).data ?? context.userId;
    const { error } = await supabaseAdmin.from("oauth_states").insert({ state, user_id: context.userId, owner_id: owner, provider: "TIKTOK", code_verifier: verifier, return_to: origin });
    if (error) throw new Error(error.message);
    return { url: authorizeUrl(state, challenge, `${origin}${TIKTOK_CALLBACK_PATH}`) };
  });

/** What TikTok allows this account to post right now (privacy options, interaction settings, max length). */
export const tiktokCreatorInfo = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ channelId: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    const ch = (await context.supabase.from("channels").select("id,platform,status").eq("id", data.channelId).single()).data;
    if (!ch || ch.platform !== "TIKTOK" || ch.status !== "CONNECTED") throw new Error("Connect this TikTok account first.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { tokenFor } = await import("./publish.server");
    const { tiktokPublisher, creatorInfo } = await import("./tiktok.server");
    return creatorInfo(await tokenFor(supabaseAdmin, ch.id, tiktokPublisher));
  });

/** Upload the queued automatic posts for this clip straight away. */
export const publishNow = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ postIds: z.array(z.string().uuid()).min(1).max(20) }))
  .handler(async ({ context, data }) => {
    const own = (await context.supabase.from("posts").select("id").in("id", data.postIds)).data ?? [];
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { publishDuePosts, registerPublishers } = await import("./publish.server");
    await registerPublishers();
    let n = 0;
    for (const p of own) n += await publishDuePosts(supabaseAdmin, 1, p.id);
    return n;
  });
