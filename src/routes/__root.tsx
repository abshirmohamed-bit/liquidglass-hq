import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { LockKeyhole, TriangleAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

import { AgencyShell } from "@/components/agency/shell";
import { WelcomeModal } from "@/components/agency/integrations";
import { Toaster } from "@/components/ui/sonner";
import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

function NotFoundComponent() {
  return (
    <div className="page">
      <section className="glass-panel">
        <div className="empty">
          <div className="empty-icon">
            <TriangleAlert />
          </div>
          <h3>That page doesn't exist</h3>
          <p>
            The link may be out of date, or the tab moved. Everything is reachable from the sidebar.
          </p>
          <div className="actions">
            <Link
              to="/"
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              Go to the dashboard
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

/** An expired or missing session is the common failure here, so say that rather than "something went wrong". */
const isAuthError = (e: unknown) => {
  const m = e instanceof Error ? e.message : String(e ?? "");
  return /unauthorized|not authenticated|no authorization header|jwt/i.test(m);
};

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  const auth = isAuthError(error);
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="page">
      <section className="glass-panel">
        <div className="empty">
          <div className="empty-icon">{auth ? <LockKeyhole /> : <TriangleAlert />}</div>
          <h3>{auth ? "Your session has ended" : "This page didn't load"}</h3>
          <p>
            {auth
              ? "Sign in again to pick up where you left off."
              : "The page hit an error on the way in. Trying again usually clears it; if it keeps happening the detail is in the browser console."}
          </p>
          <div className="actions">
            {auth ? (
              <Link
                to="/auth"
                className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
              >
                Sign in
              </Link>
            ) : (
              <button
                onClick={() => {
                  router.invalidate();
                  reset();
                }}
                className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
              >
                Try again
              </button>
            )}
            <Link
              to="/"
              className="inline-flex items-center justify-center rounded-md border border-input px-4 py-2 text-sm font-medium"
            >
              Go to the dashboard
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "crayZmundo" },
      { name: "description", content: "Internal workspace for your content agency" },
      { name: "author", content: "Lovable" },
      { property: "og:title", content: "crayZmundo" },
      { property: "og:description", content: "Internal workspace for your content agency" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:site", content: "@Lovable" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

/** Applies the saved theme before first paint so the app never flashes the wrong one. Dark is the default. */
const THEME_BOOT = `(function(){try{var t=localStorage.getItem('agency-theme');document.documentElement.classList.add(t==='light'?'light':'dark')}catch(e){document.documentElement.classList.add('dark')}})()`;

function RootShell({ children }: { children: ReactNode }) {
  return (
    // The pre-paint script may add "light" before React hydrates, so the
    // class here will not match the server's. That difference is intended.
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setSignedIn(Boolean(data.user)));
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      setSignedIn(Boolean(session?.user));
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });
    return () => data.subscription.unsubscribe();
  }, [router, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <AgencyShell signedIn={signedIn}>
        <Outlet />
      </AgencyShell>
      {signedIn && <WelcomeModal />}
      <Toaster />
    </QueryClientProvider>
  );
}
