import { createFileRoute } from "@tanstack/react-router";
import { AgencyPage, pageHead } from "@/components/agency/pages";
export const Route = createFileRoute("/_authenticated/library")({ head: () => pageHead("Library"), component: () => <AgencyPage title="Library" /> });
