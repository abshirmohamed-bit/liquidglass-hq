import { useState } from "react";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, RefreshCw, Trash2, Link2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { agencyQuery } from "@/lib/agency-query";
import { addSnapshot, connectChannel, deleteSnapshot, pullYouTube, youtubeStatus } from "@/lib/analytics.functions";
import { clientStats } from "@/lib/analytics-rules";

const fmt = (n: number | null) => (n == null ? "—" : new Intl.NumberFormat("en-US", { notation: "compact" }).format(n));
const err = (e: unknown) => toast.error(e instanceof Error ? e.message : "Something went wrong");

export function Analytics() {
  const { data } = useSuspenseQuery(agencyQuery);
  const yt = useQuery({ queryKey: ["youtube-status"], queryFn: () => youtubeStatus() });
  const [clientId, setClientId] = useState("ALL");
  const [manual, setManual] = useState(false);
  const client = data.clients.find((c) => c.id === clientId);
  return <div className="page money-page">
    <header className="page-header"><div><h1>Analytics</h1><p className="page-subtitle">Channel growth across your clients.</p></div>
      <div className="actions">
        <select aria-label="Select client" value={clientId} onChange={(e) => setClientId(e.target.value)}><option value="ALL">All clients</option>{data.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <Button disabled={!data.clients.length} onClick={() => setManual(true)}><Plus />Manual snapshot</Button>
      </div>
    </header>
    {yt.data && !yt.data.connected && <section className="glass-panel notice"><p>Live YouTube stats will be available once you connect your API key. You can add data manually meanwhile.</p><details><summary>Here’s how</summary><p>Add a YouTube Data API v3 key in Settings, then use “Pull from YouTube” on a client.</p></details></section>}
    {client ? <ClientView id={client.id} name={client.name} channel={client.channel_url} connected={!!yt.data?.connected} /> : <Comparison />}
    {manual && <ManualDialog defaultClient={client?.id ?? data.clients[0]?.id ?? ""} onClose={() => setManual(false)} />}
  </div>;
}

function Comparison() {
  const { data } = useSuspenseQuery(agencyQuery);
  if (!data.clients.length) return <section className="glass-panel empty-section"><h2>No clients yet</h2></section>;
  const rows = data.clients.map((c) => ({ c, s: clientStats(data.snapshots, c.id) }));
  const max = Math.max(1, ...rows.map((r) => r.s.views ?? 0));
  return <section className="glass-panel" style={{ padding: 20 }}><h2>All clients comparison</h2>
    <table className="data-table" style={{ width: "100%" }}><thead><tr><th align="left">Client</th><th align="left">Subscribers</th><th align="left">Total views</th><th align="left">Avg CTR</th><th align="left">Views</th></tr></thead>
      <tbody>{rows.map(({ c, s }) => <tr key={c.id}><td>{c.name}</td><td>{fmt(s.subscribers)}</td><td>{fmt(s.views)}</td><td>{s.avgCtr == null ? "—" : `${s.avgCtr.toFixed(1)}%`}</td><td><meter min="0" max={max} value={s.views ?? 0} /></td></tr>)}</tbody></table>
  </section>;
}

function Bars({ title, points }: { title: string; points: { label: string; value: number }[] }) {
  const max = Math.max(1, ...points.map((p) => p.value));
  return <section><h2>{title}</h2>{points.length ? <div className="bar-chart" role="img" aria-label={title}>{points.map((p, i) => <div className="chart-column" key={i}><span>{fmt(p.value)}</span><meter min="0" max={max} value={p.value} /><small>{p.label}</small></div>)}</div> : <p className="chart-caption">No snapshots yet</p>}</section>;
}

function ClientView({ id, name, channel, connected }: { id: string; name: string; channel: string | null; connected: boolean }) {
  const { data } = useSuspenseQuery(agencyQuery);
  const cache = useQueryClient();
  const pull = useServerFn(pullYouTube); const connect = useServerFn(connectChannel); const remove = useServerFn(deleteSnapshot);
  const [input, setInput] = useState(channel ?? ""); const [busy, setBusy] = useState(false);
  const s = clientStats(data.snapshots, id);
  const refresh = () => cache.invalidateQueries({ queryKey: ["agency"] });
  const short = (d: string | null) => (d ? new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "");
  const metrics = [["Subscribers", fmt(s.subscribers)], ["Total views", fmt(s.views)], ["Average CTR", s.avgCtr == null ? "—" : `${s.avgCtr.toFixed(1)}%`], ["Snapshots", String(s.rows.length)]];
  return <>
    <section className="glass-panel filter-bar" style={{ padding: 16 }}>
      <input aria-label="YouTube channel URL or ID" placeholder="YouTube channel URL or channel ID" value={input} onChange={(e) => setInput(e.target.value)} />
      <Button variant="outline" disabled={busy || !input.trim()} onClick={async () => { setBusy(true); try { await connect({ data: { clientId: id, channel: input } }); await refresh(); toast.success("Channel connected"); } catch (e) { err(e); } finally { setBusy(false); } }}><Link2 />Connect channel</Button>
      <Button disabled={busy || !connected} onClick={async () => { setBusy(true); try { await pull({ data: { clientId: id } }); await refresh(); } catch (e) { err(e); } finally { setBusy(false); } }}><RefreshCw />Pull from YouTube</Button>
    </section>
    <div className="dashboard-metrics">{metrics.map(([l, v]) => <article className="glass-panel metric-card" key={l}><strong>{v}</strong><h2>{l}</h2><p>{name}</p></article>)}</div>
    <div className="finance-charts">
      <Bars title="Views over time" points={s.rows.map((r) => ({ label: short(r.date), value: r.views ?? 0 }))} />
      <Bars title="Watch-time trend (hours)" points={s.rows.map((r) => ({ label: short(r.date), value: r.watch_hours ?? 0 }))} />
      <section><h2>Top-performing videos</h2>{s.top.length ? <ol>{s.top.map((v, i) => <li key={i}>{v.title} <small>· {fmt(v.views)} views</small></li>)}</ol> : <p className="chart-caption">No video data yet</p>}</section>
    </div>
    <section className="glass-panel" style={{ padding: 20 }}><h2>Snapshots</h2>
      {s.rows.length ? s.rows.slice().reverse().map((r) => { const row = data.snapshots.find((x) => x === r)!; return <div className="comparison-row" key={(row as { id: string }).id}><span>{r.date} · {fmt(r.views)} views · {fmt(r.subscribers)} subs</span><Button size="icon" variant="ghost" aria-label={`Delete snapshot ${r.date}`} onClick={async () => { try { await remove({ data: { id: (row as { id: string }).id } }); await refresh(); } catch (e) { err(e); } }}><Trash2 /></Button></div>; }) : <p className="chart-caption">No snapshots yet</p>}
    </section>
  </>;
}

function ManualDialog({ defaultClient, onClose }: { defaultClient: string; onClose: () => void }) {
  const { data } = useSuspenseQuery(agencyQuery);
  const cache = useQueryClient(); const save = useServerFn(addSnapshot);
  const [f, setF] = useState({ client_id: defaultClient, date: new Date().toISOString().slice(0, 10), views: "", subscribers: "", watch_hours: "", impressions_ctr: "", videos: "" });
  const [busy, setBusy] = useState(false);
  const n = (v: string) => (v.trim() === "" ? null : Number(v));
  return <Dialog open onOpenChange={(o) => !o && onClose()}><DialogContent className="agency-modal"><DialogTitle>Manual snapshot</DialogTitle><DialogDescription>Enter channel stats for a date</DialogDescription>
    <form className="agency-form" onSubmit={async (e) => { e.preventDefault(); setBusy(true); try {
      const top_videos = f.videos.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => { const [t, v] = l.split("|"); return { title: (t ?? "").trim(), views: Number((v ?? "0").replace(/\D/g, "")) || 0 }; });
      await save({ data: { client_id: f.client_id, date: f.date, views: n(f.views), subscribers: n(f.subscribers), watch_hours: n(f.watch_hours), impressions_ctr: n(f.impressions_ctr), top_videos } });
      await cache.invalidateQueries({ queryKey: ["agency"] }); onClose(); } catch (er) { err(er); } finally { setBusy(false); } }}>
      <label>Client<select value={f.client_id} onChange={(e) => setF({ ...f, client_id: e.target.value })}>{data.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label>Date<input type="date" required value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></label>
      <div className="form-grid"><label>Total views<input type="number" min="0" value={f.views} onChange={(e) => setF({ ...f, views: e.target.value })} /></label><label>Subscribers<input type="number" min="0" value={f.subscribers} onChange={(e) => setF({ ...f, subscribers: e.target.value })} /></label></div>
      <div className="form-grid"><label>Watch hours<input type="number" min="0" step="any" value={f.watch_hours} onChange={(e) => setF({ ...f, watch_hours: e.target.value })} /></label><label>CTR %<input type="number" min="0" max="100" step="any" value={f.impressions_ctr} onChange={(e) => setF({ ...f, impressions_ctr: e.target.value })} /></label></div>
      <label>Top videos (one per line: Title | views)<textarea value={f.videos} onChange={(e) => setF({ ...f, videos: e.target.value })} /></label>
      <div className="actions"><Button type="button" variant="outline" onClick={onClose}>Close</Button><Button disabled={busy} type="submit">{busy ? "Saving…" : "Save snapshot"}</Button></div>
    </form></DialogContent></Dialog>;
}
