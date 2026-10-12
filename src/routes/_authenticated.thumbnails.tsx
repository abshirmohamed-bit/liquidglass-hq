import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { Thumbnails } from "@/components/agency/thumbnails";
import { pageHead } from "@/components/agency/pages";
import { agencyQuery } from "@/lib/agency-query";
import { thumbnailSessionsQuery } from "@/lib/thumbnail-query";
export const Route = createFileRoute("/_authenticated/thumbnails")({
  validateSearch: z.object({ session: z.string().uuid().optional() }),
  head: () => pageHead("Thumbnails"),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(agencyQuery),
      context.queryClient.ensureQueryData(thumbnailSessionsQuery),
    ]),
  component: function Page() {
    const { session } = Route.useSearch();
    return <Thumbnails sessionId={session} />;
  },
});
