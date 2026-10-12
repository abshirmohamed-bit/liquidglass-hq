import { createFileRoute } from "@tanstack/react-router";
import { Team } from "@/components/agency/ops";
import { pageHead } from "@/components/agency/pages";
import { agencyQuery } from "@/lib/agency-query";
export const Route = createFileRoute("/_authenticated/team")({ head: () => pageHead("Team"), loader: ({ context }) => context.queryClient.ensureQueryData(agencyQuery), component: Team });
