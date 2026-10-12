import { createFileRoute } from "@tanstack/react-router";
import { AgencyPage, pageHead } from "@/components/agency/pages";
export const Route = createFileRoute("/_authenticated/clips")({ head: () => pageHead("Clips"), component: () => <AgencyPage title="Clips" /> });
