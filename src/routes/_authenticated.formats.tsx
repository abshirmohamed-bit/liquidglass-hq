import { createFileRoute } from "@tanstack/react-router";
import { AgencyPage, pageHead } from "@/components/agency/pages";
export const Route = createFileRoute("/_authenticated/formats")({ head: () => pageHead("Formats"), component: () => <AgencyPage title="Formats" /> });
