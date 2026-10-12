import { createFileRoute } from "@tanstack/react-router";
import { AgencyPage, pageHead } from "@/components/agency/pages";
export const Route = createFileRoute("/leads")({ head: () => pageHead("Leads"), component: () => <AgencyPage title="Leads"/> });
