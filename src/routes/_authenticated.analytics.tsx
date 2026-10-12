import { createFileRoute } from "@tanstack/react-router";
import { Analytics } from "@/components/agency/analytics";
import { pageHead } from "@/components/agency/pages";
import { agencyQuery } from "@/lib/agency-query";
export const Route = createFileRoute("/_authenticated/analytics")({ head: () => pageHead("Analytics"), loader: ({ context }) => context.queryClient.ensureQueryData(agencyQuery), component: Analytics });
