import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";
import { purgeCutoff } from "@/lib/library-rules";

/** Nightly purge of library rows trashed more than 30 days ago. */
export const Route = createFileRoute("/api/public/hooks/library-purge")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { deleteLibraryRow } = await import("@/lib/library.server");
        const cutoff = purgeCutoff().toISOString();
        let purged = 0;
        for (const table of ["source_assets", "assets"] as const) {
          const { data } = await supabaseAdmin.from(table).select("id").eq("status", "TRASHED").lt("trashed_at", cutoff);
          for (const r of data ?? []) { try { await deleteLibraryRow(supabaseAdmin, table, r.id); purged++; } catch (e) { console.error("purge", e); } }
        }
        return Response.json({ purged });
      },
    },
  },
});
