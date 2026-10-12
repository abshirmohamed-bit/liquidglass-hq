import { createFileRoute } from "@tanstack/react-router";
import { Clips } from "@/components/agency/clips";
import { pageHead } from "@/components/agency/pages";

export const Route = createFileRoute("/_authenticated/clips")({
  head: () => pageHead("Clips"),
  validateSearch: (search: Record<string, unknown>) => ({ source: typeof search["source"] === "string" ? search["source"] : undefined }),
  component: () => <Clips />,
});
