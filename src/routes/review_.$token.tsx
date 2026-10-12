import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getShared, decideShared } from "@/lib/review.functions";

export const Route = createFileRoute("/review_/$token")({
  head: () => ({ meta: [
    { title: "Review clips — crayZmundo" }, { name: "description", content: "Review and approve the clips shared with you." },
    { property: "og:title", content: "Review clips — crayZmundo" }, { property: "og:description", content: "Review and approve the clips shared with you." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" },
  ] }),
  component: SharedReview,
});

function SharedReview() {
  const { token } = Route.useParams();
  const q = useQuery({ queryKey: ["shared", token], queryFn: () => getShared({ data: { token } }) });
  const [notes, setNotes] = useState<Record<string, string>>({});
  async function decide(clipId: string, decision: "APPROVE" | "CHANGES") {
    try { await decideShared({ data: { token, clipId, decision, note: notes[clipId] } }); toast.success(decision === "APPROVE" ? "Approved — thank you" : "Changes requested"); await q.refetch(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Could not save"); }
  }
  if (q.isLoading) return <div className="page"><p className="muted">Loading…</p></div>;
  if (!q.data?.ok) return <div className="page"><section className="glass-panel placeholder-panel"><h1>This review link has expired</h1><p>Ask for a new link.</p></section></div>;
  return <div className="page"><header className="page-header"><div><h1>Review clips</h1><p className="page-subtitle">Approve each clip or ask for changes.</p></div></header>
    <div className="lib-grid">{q.data.clips.map((c) => <article key={c.id} className="glass-panel lib-card" aria-label={c.title ?? "Clip"}>
      {c.video ? <video controls preload="metadata" poster={c.thumb ?? undefined} src={c.exported ? c.video : `${c.video}#t=${(c.start_ms ?? 0) / 1000},${(c.end_ms ?? 0) / 1000}`} /> : c.thumb && <img src={c.thumb} alt="" />}
      {!c.exported && <span className="status-pill">Low-res preview</span>}
      <h3>{c.title ?? "Clip"}</h3>
      {c.feedback && <p className="caption">{c.feedback}</p>}
      <textarea aria-label="Note" placeholder="Optional note" value={notes[c.id] ?? ""} onChange={(e) => setNotes((n) => ({ ...n, [c.id]: e.target.value }))} />
      <div className="review-actions"><Button size="sm" onClick={() => decide(c.id, "APPROVE")}>Approve</Button><Button size="sm" variant="outline" onClick={() => decide(c.id, "CHANGES")}>Request changes</Button></div>
    </article>)}</div></div>;
}
