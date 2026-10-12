import { createFileRoute } from "@tanstack/react-router";
import { AgencyPage, pageHead } from "@/components/agency/pages";
export const Route = createFileRoute("/clients")({ head: () => pageHead("Clients"), component: () => <AgencyPage title="Clients"/> });
