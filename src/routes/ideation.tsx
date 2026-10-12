import { createFileRoute } from "@tanstack/react-router";
import { AgencyPage, pageHead } from "@/components/agency/pages";
export const Route = createFileRoute("/ideation")({ head: () => pageHead("Ideation"), component: () => <AgencyPage title="Ideation"/> });
