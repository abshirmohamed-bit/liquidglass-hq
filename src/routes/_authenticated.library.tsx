import { createFileRoute } from "@tanstack/react-router";
import { pageHead } from "@/components/agency/pages";
import { Library } from "@/components/agency/library";
export const Route = createFileRoute("/_authenticated/library")({ head: () => pageHead("Library"), component: Library });
