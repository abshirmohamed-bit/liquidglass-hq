import { createFileRoute } from "@tanstack/react-router";
import { AgencyPage, pageHead } from "@/components/agency/pages";
export const Route = createFileRoute("/team")({ head: () => pageHead("Team"), component: () => <AgencyPage title="Team"/> });
