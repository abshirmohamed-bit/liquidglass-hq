import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
  Moon,
  Layers2,
  ChevronDown,
  UserRound,
  LogOut,
  LockKeyhole,
  Bell,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { meQuery } from "@/lib/me-query";
import { canSeeTab, roleLabel, visibleTabs } from "@/lib/roles";
import { clipBadge } from "@/lib/clip.functions";
import { listNotifications, markNotification } from "@/lib/review.functions";
import { agencyPages, extraPages } from "./pages";

/**
 * Sidebar groups. The order matches NAV_ORDER exactly, so this only adds
 * headings — it never reorders tabs. A heading is dropped when the role
 * cannot see any tab under it.
 */
/**
 * The sidebar follows the journey: start work, approve it, publish it, run the
 * business. Everything occasional sits under "More" so the daily path is short.
 */
const GROUPS: { label: string | null; tabs: string[]; folded?: boolean }[] = [
  { label: null, tabs: ["Dashboard"] },
  { label: "Make clips", tabs: ["Library", "Clips", "Review"] },
  { label: "Publish", tabs: ["Posts", "Analytics"] },
  { label: "Business", tabs: ["Clients", "Money"] },
  {
    label: "More",
    folded: true,
    tabs: ["Formats", "Campaigns", "Tools", "Ideation", "Thumbnails", "Leads", "Team", "Onboarding", "Settings"],
  },
];

function NotificationBell() {
  const navigate = useNavigate();
  const q = useQuery({
    queryKey: ["notifications"],
    queryFn: () => listNotifications(),
    refetchInterval: 20000,
  });
  const items = q.data ?? [];
  const unread = items.filter((n) => !n.read).length;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
        >
          <Bell />
          {unread > 0 && <span className="nav-badge bell-badge">{unread}</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-80 max-h-96 overflow-auto">
        <DropdownMenuLabel className="flex items-center justify-between gap-3">
          <span>Notifications</span>
          {unread > 0 && (
            <button
              className="link-button"
              onClick={async () => {
                await markNotification({ data: { id: null } });
                q.refetch();
              }}
            >
              Mark all read
            </button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.length === 0 && (
          <div className="caption" style={{ padding: "14px 10px" }}>
            Nothing yet. Jobs, exports and posts report here.
          </div>
        )}
        {items.map((n) => (
          <DropdownMenuItem
            key={n.id}
            onClick={async () => {
              await markNotification({ data: { id: n.id } });
              q.refetch();
              if (n.link) navigate({ to: n.link as "/" });
            }}
          >
            <div>
              <div className={n.read ? "text-sm" : "text-sm font-medium"}>{n.title}</div>
              <div className="caption">{n.body}</div>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AccountMenu() {
  const account = useQuery(meQuery);
  const me = account.data;
  const navigate = useNavigate();
  // Until the account resolves, a "Sign in" button tells the user they have
  // been logged out. Hold a quiet placeholder instead.
  if (account.isPending) return <span className="account-pending skeleton" aria-hidden="true" />;
  if (!me)
    return (
      <Button asChild variant="outline" size="sm">
        <Link to="/auth">Sign in</Link>
      </Button>
    );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="account-menu-trigger"
          aria-label="Account menu"
        >
          <span className="account-avatar">
            <UserRound size={14} />
          </span>
          <span className="account-menu-name">{me.name}</span>
          <span className="status-pill tone-blue">{roleLabel(me.role)}</span>
          <ChevronDown size={13} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuLabel>
          <div className="text-sm font-medium">{me.name}</div>
          <div className="caption">
            {me.email} · {roleLabel(me.role)}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={async () => {
            await supabase.auth.signOut();
            navigate({ to: "/auth" });
          }}
        >
          <LogOut size={14} />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AgencyShell({ children, signedIn }: { children: ReactNode; signedIn: boolean }) {
  const [collapsed, setCollapsed] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  // Dark is the default; only an explicit saved choice turns the lights on.
  const [light, setLight] = useState(false);
  const me = useQuery({ ...meQuery, enabled: signedIn }).data;
  const badgeCount =
    useQuery({
      queryKey: ["clip-badge"],
      enabled: signedIn,
      queryFn: () => clipBadge(),
      refetchInterval: 15000,
    }).data?.found ?? 0;
  const role = signedIn ? me?.role : null;
  const path = useLocation({ select: (l) => l.pathname });

  useEffect(() => {
    setLight(localStorage.getItem("agency-theme") === "light");
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("light", light);
    document.documentElement.classList.toggle("dark", !light);
  }, [light]);
  function toggleTheme() {
    const next = !light;
    setLight(next);
    localStorage.setItem("agency-theme", next ? "light" : "dark");
  }

  // Signed-out visitors see the full shell (public placeholder pages); signed-in users see only their role's tabs.
  const tabs = role ? (visibleTabs(role) as string[]) : agencyPages.map((p) => p.title);
  const groups = GROUPS.map((g) => ({
    label: g.label,
    folded: !!g.folded,
    pages: agencyPages.filter((p) => g.tabs.includes(p.title) && tabs.includes(p.title)),
  })).filter((g) => g.pages.length > 0);
  const current = [...agencyPages, ...extraPages]
    .filter((p) => p.path !== "/")
    .find((p) => path === p.path || path.startsWith(p.path + "/"));
  const blocked = !!role && !!current && role !== "ADMIN" && !canSeeTab(role, current.title);

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to="/" className="brand">
          <span className="brand-mark">
            <Layers2 size={14} />
          </span>
          <span>crayZmundo</span>
        </Link>
        <div className="top-actions">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            aria-label={light ? "Switch to dark mode" : "Switch to light mode"}
            title={light ? "Dark mode" : "Light mode"}
          >
            {light ? <Moon /> : <Sun />}
          </Button>
          {signedIn && <NotificationBell />}
          {signedIn && <AccountMenu />}
        </div>
      </header>

      <div className="app-body">
        <aside className={`agency-sidebar ${collapsed ? "collapsed" : ""}`}>
          <Button
            variant="ghost"
            className="sidebar-collapse"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <PanelLeftOpen />
            ) : (
              <>
                <PanelLeftClose />
                <span className="nav-text">Collapse</span>
              </>
            )}
          </Button>
          <nav className="nav-list" aria-label="Main navigation">
            {groups.map((group, i) => (
              <div
                key={group.label ?? "main"}
                style={i > 0 ? { marginTop: "var(--s4)" } : undefined}
              >
                {group.folded && !collapsed ? (
                  <button
                    type="button"
                    className="nav-link nav-more"
                    aria-expanded={moreOpen}
                    onClick={() => setMoreOpen((v) => !v)}
                  >
                    <ChevronDown className={moreOpen ? "more-chevron is-open" : "more-chevron"} />
                    <span className="nav-text">More</span>
                  </button>
                ) : (
                  group.label && !collapsed && <p className="sidebar-label">{group.label}</p>
                )}
                {(!group.folded || collapsed || moreOpen || group.pages.some((p) => path.startsWith(p.path))
                  ? group.pages
                  : []
                ).map((p) => (
                  <Link
                    key={p.path}
                    to={p.path}
                    activeOptions={{ exact: true }}
                    className="nav-link"
                    title={p.title}
                  >
                    <p.icon />
                    {!collapsed && <span className="nav-text">{p.title}</span>}
                    {p.title === "Review" && !collapsed && badgeCount > 0 && (
                      <span className="nav-badge" aria-label={`${badgeCount} clips to review`}>
                        {badgeCount}
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <Link to="/auth" className="account-link" title="Account">
              <span className="account-avatar">
                <UserRound size={15} />
              </span>
              {!collapsed && (
                <>
                  <div className="account-copy min-w-0">
                    <div className="text-xs font-medium">{me?.name ?? "Agency account"}</div>
                    <div className="account-caption">
                      {signedIn ? (me ? roleLabel(me.role) : "Manage account") : "Sign in"}
                    </div>
                  </div>
                  <ChevronDown size={13} className="account-copy ml-auto text-muted-foreground" />
                </>
              )}
            </Link>
          </div>
        </aside>

        <main className="main-area">
          <div className="liquid-background" />
          {blocked ? (
            <div className="page">
              <section className="glass-panel" aria-label="No access">
                <div className="empty">
                  <div className="empty-icon">
                    <LockKeyhole />
                  </div>
                  <h2>{current!.title} is not part of your role</h2>
                  <p>
                    Your account is set to {role ? roleLabel(role) : "a limited role"}. An admin can
                    change that on the Team tab.
                  </p>
                </div>
              </section>
            </div>
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
}
