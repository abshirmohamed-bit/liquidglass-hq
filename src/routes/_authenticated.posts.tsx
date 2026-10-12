import { createFileRoute } from "@tanstack/react-router";
import { pageHead } from "@/components/agency/pages";
import { Posts } from "@/components/agency/posts";
export const Route = createFileRoute("/_authenticated/posts")({ head: () => pageHead("Posts"), component: Posts });
