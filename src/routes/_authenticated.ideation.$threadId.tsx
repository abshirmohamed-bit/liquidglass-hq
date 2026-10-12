import { createFileRoute } from "@tanstack/react-router";
import { Ideation } from "@/components/agency/ideation";
import { pageHead } from "@/components/agency/pages";
import { agencyQuery } from "@/lib/agency-query";
import { ideationQuery, ideationThreadQuery } from "@/lib/ideation-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { UIMessage } from "ai";
export const Route = createFileRoute("/_authenticated/ideation/$threadId")({
  head: () => pageHead("Ideation conversation"),
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData(agencyQuery),
      context.queryClient.ensureQueryData(ideationQuery),
      context.queryClient.ensureQueryData(ideationThreadQuery(params.threadId)),
    ]),
  component: Thread,
});
function Thread() {
  const { threadId } = Route.useParams();
  const { data } = useSuspenseQuery(ideationThreadQuery(threadId));
  return (
    <Ideation threadId={threadId} initialMessages={JSON.parse(data.messagesJson) as UIMessage[]} />
  );
}
