import { createFileRoute } from "@tanstack/react-router";
import { Ideation } from "@/components/agency/ideation";
import { pageHead } from "@/components/agency/pages";
import { agencyQuery } from "@/lib/agency-query";
import { ideationQuery } from "@/lib/ideation-query";
export const Route = createFileRoute("/_authenticated/ideation/")({
  head: () => pageHead("Ideation"),
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(agencyQuery),
      context.queryClient.ensureQueryData(ideationQuery),
    ]),
  component: () => <Ideation />,
});
