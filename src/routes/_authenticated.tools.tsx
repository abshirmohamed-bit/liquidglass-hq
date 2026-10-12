import { createFileRoute } from "@tanstack/react-router";
import { AgencyPage, pageHead } from "@/components/agency/pages";
export const Route = createFileRoute("/_authenticated/tools")({ head: () => pageHead("Tools"), component: () => <AgencyPage title="Tools" /> });
