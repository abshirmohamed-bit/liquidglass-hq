import { createFileRoute } from "@tanstack/react-router";
import { Calendar } from "@/components/agency/ops";
import { pageHead } from "@/components/agency/pages";
import { agencyQuery } from "@/lib/agency-query";
export const Route = createFileRoute("/_authenticated/calendar")({ head: () => pageHead("Calendar"), loader: ({ context }) => context.queryClient.ensureQueryData(agencyQuery), component: Calendar });
