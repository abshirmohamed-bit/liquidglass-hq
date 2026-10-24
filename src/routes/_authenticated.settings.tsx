import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { pageHead } from "@/components/agency/pages";
import { AiTraining } from "@/components/agency/training";
import { CopyVoice } from "@/components/agency/voice";
import { IntegrationsPanel } from "@/components/agency/integrations";
import { INTEGRATION_IDS } from "@/lib/integration-rules";
import { agencyQuery } from "@/lib/agency-query";
export const Route = createFileRoute("/_authenticated/settings")({
  validateSearch: z.object({ guide: z.enum(INTEGRATION_IDS).optional() }),
  head: () => pageHead("Settings"),
  loader: ({ context }) => context.queryClient.ensureQueryData(agencyQuery),
  component: function SettingsPage() {
    const { guide } = Route.useSearch();
    return (
      <div className="page">
        <header className="page-header"><div><h1>Settings</h1><p className="page-subtitle">Connect your tools and teach the AI what good looks like.</p></div></header>
        <IntegrationsPanel initialGuide={guide} />
        <section className="settings-section"><CopyVoice /></section>
        <section className="settings-section"><AiTraining /></section>
      </div>
    );
  },
});
