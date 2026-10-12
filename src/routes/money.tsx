import { createFileRoute } from "@tanstack/react-router";
import { AgencyPage, pageHead } from "@/components/agency/pages";
export const Route = createFileRoute("/money")({ head: () => pageHead("Money"), component: () => <AgencyPage title="Money"/> });
