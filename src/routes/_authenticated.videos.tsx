import { createFileRoute } from "@tanstack/react-router";
import { pageHead } from "@/components/agency/pages";
import { Videos } from "@/components/agency/videos";
export const Route = createFileRoute("/_authenticated/videos")({
  head: () => pageHead("Videos"),
  validateSearch: (s: Record<string, unknown>) => ({
    v: typeof s["v"] === "string" ? s["v"] : undefined,
  }),
  component: function VideosPage() {
    const { v } = Route.useSearch();
    return <Videos video={v} />;
  },
});
