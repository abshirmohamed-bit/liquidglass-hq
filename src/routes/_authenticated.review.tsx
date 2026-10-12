import { createFileRoute } from "@tanstack/react-router";
import { pageHead } from "@/components/agency/pages";
import { Review } from "@/components/agency/review";
export const Route = createFileRoute("/_authenticated/review")({
  head: () => pageHead("Review"),
  validateSearch: (s: Record<string, unknown>) => ({ job: typeof s["job"] === "string" ? s["job"] : undefined }),
  component: function ReviewPage() { const { job } = Route.useSearch(); return <Review key={job ?? "all"} job={job} />; },
});
