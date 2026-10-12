import { createFileRoute } from "@tanstack/react-router";
import { Leads } from "@/components/agency/ops";
import { pageHead } from "@/components/agency/pages";
import { opsQuery } from "@/lib/ops-query";
export const Route = createFileRoute("/_authenticated/leads")({ head: () => pageHead("Leads"), loader: ({ context }) => context.queryClient.ensureQueryData(opsQuery), component: Leads });
