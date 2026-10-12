import { createFileRoute } from "@tanstack/react-router";
import { AgencyPage, pageHead } from "@/components/agency/pages";
export const Route = createFileRoute("/analytics")({ head: () => pageHead("Analytics"), component: () => <AgencyPage title="Analytics"/> });
