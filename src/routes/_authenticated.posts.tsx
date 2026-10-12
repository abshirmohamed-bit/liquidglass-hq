import { createFileRoute } from "@tanstack/react-router";
import { AgencyPage, pageHead } from "@/components/agency/pages";
export const Route = createFileRoute("/_authenticated/posts")({ head: () => pageHead("Posts"), component: () => <AgencyPage title="Posts" /> });
