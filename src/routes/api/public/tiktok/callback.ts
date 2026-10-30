import { createFileRoute } from "@tanstack/react-router";
import { TIKTOK_CALLBACK_PATH } from "@/lib/tiktok-rules";

/** TikTok sends the user back here after they approve crayZmundo. State is single-use and expires after 15 minutes. */
export const Route = createFileRoute("/api/public/tiktok/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const back = (msg: string) => Response.redirect(`${url.origin}/posts?tiktok=${encodeURIComponent(msg)}`, 302);
        const state = url.searchParams.get("state");
        const code = url.searchParams.get("code");
        if (url.searchParams.get("error")) return back(url.searchParams.get("error_description") || "cancelled");
        if (!state || !code || state.length > 100) return back("invalid");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const row = (await supabaseAdmin.from("oauth_states").delete().eq("state", state).eq("provider", "TIKTOK").select("*").maybeSingle()).data;
        if (!row || Date.now() - Date.parse(row.created_at) > 15 * 60_000) return back("expired");
        try {
          const { exchangeCode, userInfo } = await import("@/lib/tiktok.server");
          const t = await exchangeCode(code, row.code_verifier, `${url.origin}${TIKTOK_CALLBACK_PATH}`);
          const u = await userInfo(t.access_token);
          const handle = `@${u.username || u.display_name}`;
          const existing = (await supabaseAdmin.from("channels").select("id").eq("owner_id", row.owner_id).eq("platform", "TIKTOK").eq("external_account_id", t.open_id).maybeSingle()).data;
          const patch = { platform: "TIKTOK", handle, external_account_id: t.open_id, status: "CONNECTED", scopes: t.scope, connected_at: new Date().toISOString(), last_error: null, owner_id: row.owner_id, user_id: row.user_id };
          const ch = existing
            ? (await supabaseAdmin.from("channels").update(patch).eq("id", existing.id).select("id").single()).data
            : (await supabaseAdmin.from("channels").insert(patch).select("id").single()).data;
          if (!ch) throw new Error("Couldn't save the channel");
          const { error } = await supabaseAdmin.from("channel_credentials").upsert({
            channel_id: ch.id, provider: "TIKTOK", access_token: t.access_token, refresh_token: t.refresh_token,
            expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString(),
          }, { onConflict: "channel_id" });
          if (error) throw new Error(error.message);
          return back("connected");
        } catch (e) {
          console.error("tiktok callback", e);
          return back(e instanceof Error ? e.message.slice(0, 160) : "failed");
        }
      },
    },
  },
});
