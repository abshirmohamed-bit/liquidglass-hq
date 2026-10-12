import { createFileRoute } from "@tanstack/react-router";
import { AgencyPage, pageHead } from "@/components/agency/pages";
export const Route = createFileRoute("/")({ head: () => pageHead("Dashboard"), component: () => <AgencyPage title="Dashboard"/> });
