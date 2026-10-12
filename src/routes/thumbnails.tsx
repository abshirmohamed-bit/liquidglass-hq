import { createFileRoute } from "@tanstack/react-router";
import { AgencyPage, pageHead } from "@/components/agency/pages";
export const Route = createFileRoute("/thumbnails")({ head: () => pageHead("Thumbnails"), component: () => <AgencyPage title="Thumbnails"/> });
