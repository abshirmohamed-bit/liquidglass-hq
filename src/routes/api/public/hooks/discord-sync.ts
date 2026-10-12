import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/hooks/discord-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;
        const token = process.env["DISCORD_BOT_TOKEN"];
        if (!token) return Response.json({ skipped: "Discord bot not configured" });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: off } = await supabaseAdmin.from("app_settings").select("owner_id,value").eq("key", "integration:discord");
        const disabled = new Set((off ?? []).filter((r) => JSON.parse(r.value || "{}").disabled).map((r) => r.owner_id));
        const { data: owners } = await supabaseAdmin.from("clients").select("owner_id").eq("status", "ACTIVE");
        const { syncDiscord } = await import("@/lib/discord.server");
        const out = [];
        for (const owner of new Set((owners ?? []).map((o) => o.owner_id))) {
          if (disabled.has(owner)) continue;
          try { out.push(await syncDiscord(supabaseAdmin, token, owner)); } catch (e) { console.error("discord sync", e); }
        }
        return Response.json({ ran: out.length });
      },
    },
  },
});
