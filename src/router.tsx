import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { PagePending } from "./components/agency/kit";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Fetch a page's code when the pointer touches its link, so most
    // navigations have nothing left to wait for.
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    // Show the page you asked for straight away, in skeleton form. Without
    // this the previous page stays on screen while the new one loads, which
    // reads as "the click did nothing".
    defaultPendingMs: 0,
    defaultPendingMinMs: 0,
    defaultPendingComponent: PagePending,
  });

  return router;
};
