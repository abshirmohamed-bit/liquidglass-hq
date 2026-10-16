import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ListChecks, Plus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { agencyQuery } from "@/lib/agency-query";
import { opsQuery } from "@/lib/ops-query";
import { currency, financialSummary } from "@/lib/finance";
import { revenueThisMonth } from "@/lib/ops-rules";
import { label } from "@/lib/agency-rules";
import { clientStats } from "@/lib/analytics-rules";
import {
  addObjective,
  deleteObjective,
  toggleObjective,
  pipelineCounts,
} from "@/lib/ops.functions";
import { EmptyState } from "./kit";
import { IntegrationBanner } from "./integrations";

const stageTone: Record<string, string> = {
  WAITING_FOR_FOOTAGE: "tone-orange",
  FILMING: "tone-purple",
  EDITING_SHORT_FORM: "tone-blue",
  EDITING_LONG_FORM: "tone-blue",
  DESIGNING_THUMBNAIL: "tone-teal",
  IN_REVIEW: "tone-orange",
  UPLOADING: "tone-teal",
  PUBLISHED: "tone-green",
};

/** The five stages a clip moves through, in order. This is the shape of the product. */
const STAGES = [
  { key: "sources", to: "/library", name: "Sources ready", hint: "Waiting to be clipped" },
  { key: "clipping", to: "/clips", name: "Clipping now", hint: "Jobs running" },
  { key: "review", to: "/review", name: "To review", hint: "Clips the AI found" },
  { key: "ready", to: "/review", name: "Ready to post", hint: "Exported and finished" },
  { key: "scheduled", to: "/posts", name: "Scheduled", hint: "Queued or due now" },
] as const;

function Pipeline({ enabled }: { enabled: boolean }) {
  const q = useQuery({
    queryKey: ["pipeline"],
    enabled,
    queryFn: () => pipelineCounts(),
    refetchInterval: 30000,
  });
  const counts = q.data;
  return (
    <section className="section" aria-label="Pipeline">
      <div className="section-head">
        <div>
          <h2>In the pipeline</h2>
          <p className="caption">
            Every clip moves left to right, from a source you upload to a post that is live.
          </p>
        </div>
      </div>
      <div className="pipeline-strip">
        {STAGES.map((s) => {
          const n = counts ? counts[s.key] : null;
          return (
            <Link key={s.key} to={s.to} className={`pipeline-step${n ? " is-active" : ""}`}>
              <strong>{n ?? "—"}</strong>
              <span>{s.name}</span>
              <em>{s.hint}</em>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export function Dashboard() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
  }, []);
  const agency = useQuery({ ...agencyQuery, enabled: !!signedIn });
  const ops = useQuery({ ...opsQuery, enabled: !!signedIn });
  const cache = useQueryClient();
  const add = useServerFn(addObjective);
  const toggle = useServerFn(toggleObjective);
  const remove = useServerFn(deleteObjective);
  const [text, setText] = useState("");
  const today = new Date().toISOString().slice(0, 10);
  const d = agency.data;
  const o = ops.data;
  const summary = d ? financialSummary(d.clients, d.payments, d.team) : null;

  const metrics = [
    {
      value: summary ? currency(summary.mrr) : "—",
      label: "Monthly recurring revenue",
      detail: d
        ? `${d.clients.filter((c) => c.status === "ACTIVE").length} active clients`
        : "Sign in to see totals",
    },
    { value: d ? String(d.clients.length) : "—", label: "Clients", detail: "Everyone on record" },
    {
      value: d ? currency(revenueThisMonth(d.payments, today)) : "—",
      label: `Collected in ${new Intl.DateTimeFormat("en", { month: "long", timeZone: "UTC" }).format(new Date())}`,
      detail: "Payments received this month",
    },
    {
      value: summary ? currency(summary.outstanding) : "—",
      label: "Outstanding",
      detail: "Billed but not yet paid",
    },
  ];

  const todays = (o?.objectives ?? []).filter((x) => x.day === today);
  const watch = d
    ? d.clients.map((c) => {
        const rows = clientStats(d.snapshots, c.id).rows;
        const cutoff = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
        const recent = rows.filter((r) => (r.date ?? "") >= cutoff);
        const first = recent[0];
        const last = recent[recent.length - 1];
        return {
          name: c.name,
          change: first && last && first !== last ? (last.views ?? 0) - (first.views ?? 0) : null,
        };
      })
    : [];
  const refresh = () => cache.invalidateQueries({ queryKey: ["ops"] });

  return (
    <div className="page dashboard-page">
      <IntegrationBanner id="discord" />
      <header className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p className="page-subtitle">
            Where the work stands today — clips in flight, revenue, and what to get done.
          </p>
        </div>
      </header>

      {signedIn === false && (
        <p className="notice">
          <Link to="/auth">Sign in</Link> to see your pipeline and your numbers.
        </p>
      )}

      <Pipeline enabled={!!signedIn} />

      <section className="section" aria-label="Money">
        <div className="section-head">
          <h2>Money</h2>
        </div>
        <div className="dashboard-metrics">
          {metrics.map((metric) => (
            <article className="glass-panel metric-card" key={metric.label}>
              <strong>{metric.value}</strong>
              <h2>{metric.label}</h2>
              <p>{metric.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section" aria-label="Client production stages">
        <div className="section-head">
          <h2>Client production stages</h2>
        </div>
        {d?.clients.length ? (
          <div className="stage-cards">
            {d.clients.map((c) => {
              const stage =
                d.progress.find((p) => p.client_id === c.id)?.stage || "WAITING_FOR_FOOTAGE";
              return (
                <Link
                  key={c.id}
                  to="/clients/$clientId"
                  params={{ clientId: c.id }}
                  className="glass-panel stage-card"
                >
                  <strong>{c.name}</strong>
                  <span className={`stage-pill status-pill ${stageTone[stage] ?? ""}`}>
                    {label(stage)}
                  </span>
                </Link>
              );
            })}
          </div>
        ) : (
          <section className="glass-panel">
            <EmptyState
              icon={Users}
              title="No clients yet"
              hint="Add a client to track where their content is in production."
              action={
                <Button asChild size="sm">
                  <Link to="/clients">Add a client</Link>
                </Button>
              }
            />
          </section>
        )}
      </section>

      <section
        className="glass-panel objectives-panel section"
        aria-labelledby="objectives-heading"
      >
        <header>
          <h2 id="objectives-heading">
            <ListChecks size={16} />
            Today
          </h2>
          <span>
            {new Intl.DateTimeFormat("en", {
              weekday: "long",
              day: "numeric",
              month: "long",
            }).format(new Date())}
          </span>
        </header>

        <div className="objective-section" style={{ marginTop: "var(--s4)" }}>
          <h3>Views over the last 30 days</h3>
          {watch.some((w) => w.change != null) ? (
            watch
              .filter((w) => w.change != null)
              .map((w) => (
                <p key={w.name}>
                  {w.name}:{" "}
                  <strong className={w.change! < 0 ? "text-destructive" : ""}>
                    {w.change! >= 0 ? "+" : ""}
                    {w.change!.toLocaleString()} views
                  </strong>
                </p>
              ))
          ) : (
            <p>Two analytics snapshots in the last 30 days will show the change here.</p>
          )}
        </div>

        <div className="objective-section">
          <h3>To-dos</h3>
          {todays.length ? (
            todays.map((x) => (
              <label key={x.id} className="objective-item">
                <input
                  type="checkbox"
                  checked={x.done}
                  onChange={async (e) => {
                    try {
                      await toggle({ data: { id: x.id, done: e.target.checked } });
                      await refresh();
                    } catch (er) {
                      toast.error(String(er));
                    }
                  }}
                />
                <span
                  style={{
                    textDecoration: x.done ? "line-through" : undefined,
                    color: x.done ? "var(--muted-foreground)" : undefined,
                  }}
                >
                  {x.text}
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Delete ${x.text}`}
                  style={{ marginLeft: "auto" }}
                  onClick={async (e) => {
                    e.preventDefault();
                    await remove({ data: { id: x.id } });
                    await refresh();
                  }}
                >
                  <Trash2 />
                </Button>
              </label>
            ))
          ) : (
            <p>Nothing yet. Add the first one below.</p>
          )}
        </div>

        <form
          className="objective-entry"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!text.trim()) return;
            try {
              await add({ data: { text, day: today } });
              setText("");
              await refresh();
            } catch (er) {
              toast.error(er instanceof Error ? er.message : "Could not add");
            }
          }}
        >
          <input
            aria-label="New to-do"
            placeholder="What needs doing today?"
            disabled={!signedIn}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <Button type="submit" disabled={!signedIn || !text.trim()}>
            <Plus size={15} />
            Add
          </Button>
        </form>
      </section>
    </div>
  );
}
