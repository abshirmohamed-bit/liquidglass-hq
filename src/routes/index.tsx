import { createFileRoute } from "@tanstack/react-router";
import { pageHead } from "@/components/agency/pages";
import { Dashboard } from "@/components/agency/dashboard";
export const Route = createFileRoute("/")({ head: () => pageHead("Dashboard"), component: Dashboard });
