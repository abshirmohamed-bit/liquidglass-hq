import { createFileRoute } from "@tanstack/react-router";
import { YOUTUBE_CALLBACK_PATH } from "@/lib/youtube-rules";

/** Google sends the user back here after they approve crayZmundo. State is single-use and expires after 15 minutes. */
export const Route = createFileRoute("/api/public/youtube/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const back = (msg: string) => Response.redirect(`${url.origin}/posts?youtube=${encodeURIComponent(msg)}`, 302);
        const state = url.searchParams.get("state");
        const code = url.searchParams.get("code");
        if (url.searchParams.get("error")) return back(url.searchParams.get("error") || "cancelled");
        if (!state || !code || state.length > 100) return back("invalid");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const row = (await supabaseAdmin.from("oauth_states").delete().eq("state", state).eq("provider", "YOUTUBE").select("*").maybeSingle()).data;
        if (!row || Date.now() - Date.parse(row.created_at) > 15 * 60_000) return back("expired");
        try {
          const { exchangeCode, channelInfo } = await import("@/lib/youtube.server");
          const t = await exchangeCode(code, `${url.origin}${YOUTUBE_CALLBACK_PATH}`);
          if (!t.refresh_token) throw new Error("Google didn't return a refresh token — reconnect and approve again.");
          const ch = await channelInfo(t.access_token);
          const handle = ch.handle ?? ch.title;
          const existing = (await supabaseAdmin.from("channels").select("id").eq("owner_id", row.owner_id).eq("platform", "YOUTUBE").eq("external_account_id", ch.id).maybeSingle()).data;
          const patch = { platform: "YOUTUBE", handle, external_account_id: ch.id, status: "CONNECTED", scopes: t.scope, connected_at: new Date().toISOString(), last_error: null, owner_id: row.owner_id, user_id: row.user_id };
          const saved = existing
            ? (await supabaseAdmin.from("channels").update(patch).eq("id", existing.id).select("id").single()).data
            : (await supabaseAdmin.from("channels").insert(patch).select("id").single()).data;
          if (!saved) throw new Error("Couldn't save the channel");
          const { error } = await supabaseAdmin.from("channel_credentials").upsert({
            channel_id: saved.id, provider: "YOUTUBE", access_token: t.access_token, refresh_token: t.refresh_token,
            expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString(),
          }, { onConflict: "channel_id" });
          if (error) throw new Error(error.message);
          return back("connected");
        } catch (e) {
          console.error("youtube callback", e);
          return back(e instanceof Error ? e.message.slice(0, 160) : "failed");
        }
      },
    },
  },
});
