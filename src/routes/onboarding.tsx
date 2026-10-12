import { createFileRoute } from "@tanstack/react-router";
import { AgencyPage, pageHead } from "@/components/agency/pages";
export const Route = createFileRoute("/onboarding")({ head: () => pageHead("Onboarding"), component: () => <AgencyPage title="Onboarding"/> });
