import { createFileRoute } from "@tanstack/react-router";
import { AgencyPage, pageHead } from "@/components/agency/pages";
export const Route = createFileRoute("/calendar")({ head: () => pageHead("Calendar"), component: () => <AgencyPage title="Calendar"/> });
