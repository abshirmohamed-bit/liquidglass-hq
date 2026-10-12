import { createFileRoute } from "@tanstack/react-router";
import { AgencyPage, pageHead } from "@/components/agency/pages";
export const Route = createFileRoute("/_authenticated/review")({ head: () => pageHead("Review"), component: () => <AgencyPage title="Review" /> });
