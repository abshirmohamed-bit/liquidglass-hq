import { createFileRoute } from "@tanstack/react-router";
import { AgencyPage, pageHead } from "@/components/agency/pages";
export const Route = createFileRoute("/_authenticated/campaigns")({ head: () => pageHead("Campaigns"), component: () => <AgencyPage title="Campaigns" /> });
