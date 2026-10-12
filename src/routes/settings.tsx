import { createFileRoute } from "@tanstack/react-router";
import { AgencyPage, pageHead } from "@/components/agency/pages";
export const Route = createFileRoute("/settings")({ head: () => pageHead("Settings"), component: () => <AgencyPage title="Settings"/> });
