import { createFileRoute } from "@tanstack/react-router";
import { Onboarding } from "@/components/agency/ops";
import { pageHead } from "@/components/agency/pages";
export const Route = createFileRoute("/onboarding")({ head: () => pageHead("Onboarding"), component: Onboarding });
