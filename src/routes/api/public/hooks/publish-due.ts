import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/** Every few minutes: upload scheduled automatic posts whose time has come. */
export const Route = createFileRoute("/api/public/hooks/publish-due")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { publishDuePosts, registerPublishers } = await import("@/lib/publish.server");
        await registerPublishers();
        return Response.json({ moved: await publishDuePosts(supabaseAdmin, 3) });
      },
    },
  },
});
