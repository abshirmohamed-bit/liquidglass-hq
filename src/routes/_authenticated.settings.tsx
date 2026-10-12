import { createFileRoute } from "@tanstack/react-router";
import { pageHead } from "@/components/agency/pages";
import { AiTraining } from "@/components/agency/training";
import { agencyQuery } from "@/lib/agency-query";
export const Route = createFileRoute("/_authenticated/settings")({
  head: () => pageHead("Settings"),
  loader: ({ context }) => context.queryClient.ensureQueryData(agencyQuery),
  component: () => (
    <div className="page">
      <header className="page-header"><div><h1>Settings</h1><p className="page-subtitle">Teach the AI what good looks like.</p></div></header>
      <AiTraining />
    </div>
  ),
});
