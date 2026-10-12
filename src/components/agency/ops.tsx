import { useState } from "react";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, ChevronRight, Download, Pencil, Plus, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { agencyQuery } from "@/lib/agency-query";
import { opsQuery } from "@/lib/ops-query";
import { currency } from "@/lib/finance";
import { label } from "@/lib/agency-rules";
import { capacity, LEAD_STATUSES, MAX_CLIENTS_PER_MEMBER, monthGrid, pipelineTotals, type LeadStatus } from "@/lib/ops-rules";
import { deleteLead, deleteTeamMember, saveLead, saveTeamMember, setPaymentCollected } from "@/lib/ops.functions";

const err = (e: unknown) => toast.error(e instanceof Error ? e.message : "Something went wrong");

/* ---------------- Calendar ---------------- */
export function Calendar() {
  const { data } = useSuspenseQuery(agencyQuery);
  const cache = useQueryClient();
  const toggle = useServerFn(setPaymentCollected);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const today = new Date().toISOString().slice(0, 10);
  const shift = (n: number) => { const d = new Date(`${month}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); setMonth(d.toISOString().slice(0, 7)); };
  const name = (id: string) => data.clients.find((c) => c.id === id)?.name ?? "Client";
  const title = new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));
  const due = data.payments.filter((p) => p.due_date?.startsWith(month));
  return <div className="page">
    <header className="page-header"><div><h1>Calendar</h1><p className="page-subtitle">When to collect each payment, from whom, and how much. Click a name to mark it collected.</p></div>
      <div className="actions"><Button variant="outline" size="icon" aria-label="Previous month" onClick={() => shift(-1)}><ChevronLeft /></Button><strong style={{ minWidth: 150, textAlign: "center" }}>{title}</strong><Button variant="outline" size="icon" aria-label="Next month" onClick={() => shift(1)}><ChevronRight /></Button></div>
    </header>
    <p className="chart-caption">{due.length} payment{due.length === 1 ? "" : "s"} due · {currency(due.reduce((s, p) => s + p.amount, 0))}</p>
    <div className="glass-panel calendar-grid" role="grid" aria-label={title}>
      {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="calendar-head">{d}</div>)}
      {monthGrid(month).map((day, i) => <div key={i} className={`calendar-cell${day === today ? " today" : ""}`}>
        {day && <><span className="calendar-day">{Number(day.slice(8))}</span>
          {data.payments.filter((p) => p.due_date === day).map((p) => { const paid = p.status === "PAID"; const late = !paid && day < today;
            return <button key={p.id} type="button" className={`calendar-pay ${paid ? "paid" : late ? "overdue" : "pending"}`} aria-pressed={paid} title={paid ? "Collected — click to undo" : "Click to mark collected"}
              onClick={async () => { try { await toggle({ data: { id: p.id, collected: !paid } }); await cache.invalidateQueries({ queryKey: ["agency"] }); toast.success(paid ? `${name(p.client_id)} marked not collected` : `Collected ${currency(p.amount)} from ${name(p.client_id)}`); } catch (e) { err(e); } }}>
              {paid ? "✓ " : ""}{name(p.client_id)} · {currency(p.amount)}</button>; })}
        </>}
      </div>)}
    </div>
  </div>;
}

/* ---------------- Team ---------------- */
type Member = { id?: string; client_id: string; name: string; role: string; cost: number };
export function Team() {
  const { data } = useSuspenseQuery(agencyQuery);
  const cache = useQueryClient();
  const remove = useServerFn(deleteTeamMember);
  const [edit, setEdit] = useState<Member | null>(null);
  const cap = capacity(data.team.map((m) => ({ name: m.name, role: m.role, client_id: m.client_id })));
  return <div className="page">
    <header className="page-header"><div><h1>Team</h1><p className="page-subtitle">Who is allocated to each client, and what it costs.</p></div>
      <Button disabled={!data.clients.length} onClick={() => setEdit({ client_id: data.clients[0]?.id ?? "", name: "", role: "LONG_FORM_EDITOR", cost: 0 })}><Plus />Add team member</Button></header>
    {!data.clients.length && <section className="glass-panel empty-section"><h2>Add a client first</h2></section>}
    <section className="glass-panel" style={{ padding: 20 }} aria-label="Capacity tracker"><h2>Capacity tracker</h2><p className="chart-caption">Flagged when someone handles more than {MAX_CLIENTS_PER_MEMBER} clients.</p>
      {cap.length ? cap.map((c) => <div className="comparison-row" key={c.name}><span>{c.name} <small>· {label(c.role || "Member")}</small></span><strong className={c.overloaded ? "text-destructive" : ""}>{c.overloaded && <AlertTriangle size={14} style={{ display: "inline", marginRight: 4 }} />}{c.count} client{c.count === 1 ? "" : "s"}{c.overloaded ? " · Overloaded" : ""}</strong></div>) : <p>No team members yet</p>}
    </section>
    <div className="team-lanes">{data.clients.map((c) => { const lane = data.team.filter((m) => m.client_id === c.id);
      return <section className="glass-panel team-lane" key={c.id} aria-label={`${c.name} lane`}><header><h2>{c.name}</h2><strong>{currency(lane.reduce((s, m) => s + (m.cost ?? 0), 0))}<small>/mo</small></strong></header>
        {lane.length ? lane.map((m) => <div className="comparison-row" key={m.id}><span>{m.name}<small> · {label(m.role || "Member")}</small></span><span>{currency(m.cost)}/mo
          <Button size="icon" variant="ghost" aria-label={`Edit ${m.name}`} onClick={() => setEdit({ id: m.id, client_id: m.client_id, name: m.name, role: m.role || "LONG_FORM_EDITOR", cost: m.cost ?? 0 })}><Pencil /></Button>
          <Button size="icon" variant="ghost" aria-label={`Remove ${m.name}`} onClick={async () => { try { await remove({ data: { id: m.id } }); await cache.invalidateQueries({ queryKey: ["agency"] }); } catch (e) { err(e); } }}><Trash2 /></Button></span></div>) : <p className="chart-caption">No one assigned</p>}
      </section>; })}</div>
    {edit && <MemberDialog value={edit} onClose={() => setEdit(null)} />}
  </div>;
}
function MemberDialog({ value, onClose }: { value: Member; onClose: () => void }) {
  const { data } = useSuspenseQuery(agencyQuery);
  const cache = useQueryClient(); const save = useServerFn(saveTeamMember);
  const [f, setF] = useState(value); const [busy, setBusy] = useState(false);
  return <Dialog open onOpenChange={(o) => !o && onClose()}><DialogContent className="agency-modal"><DialogTitle>{value.id ? "Edit team member" : "Add team member"}</DialogTitle><DialogDescription>Role and monthly cost for one client</DialogDescription>
    <form className="agency-form" onSubmit={async (e) => { e.preventDefault(); setBusy(true); try { await save({ data: f }); await cache.invalidateQueries({ queryKey: ["agency"] }); onClose(); } catch (er) { err(er); } finally { setBusy(false); } }}>
      <label>Name<input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
      <label>Client<select value={f.client_id} onChange={(e) => setF({ ...f, client_id: e.target.value })}>{data.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <div className="form-grid"><label>Role<select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{["CHANNEL_MANAGER", "SHORT_FORM_EDITOR", "LONG_FORM_EDITOR", "THUMBNAIL_DESIGNER"].map((r) => <option key={r} value={r}>{label(r)}</option>)}</select></label>
        <label>Monthly cost<input type="number" min="0" value={f.cost} onChange={(e) => setF({ ...f, cost: Number(e.target.value) })} /></label></div>
      <div className="actions"><Button type="button" variant="outline" onClick={onClose}>Close</Button><Button disabled={busy} type="submit">{busy ? "Saving…" : "Save"}</Button></div>
    </form></DialogContent></Dialog>;
}

/* ---------------- Leads ---------------- */
type LeadForm = { id?: string; name: string; channel_url: string; notes: string; status: LeadStatus; upfront_cash: number; monthly_recurring: number };
export function Leads() {
  const { data } = useSuspenseQuery(opsQuery);
  const cache = useQueryClient(); const remove = useServerFn(deleteLead);
  const [edit, setEdit] = useState<LeadForm | null>(null);
  const totals = pipelineTotals(data.leads);
  return <div className="page">
    <header className="page-header"><div><h1>Leads</h1><p className="page-subtitle">Prospects you want to close.</p></div>
      <Button onClick={() => setEdit({ name: "", channel_url: "", notes: "", status: "TO_CONTACT", upfront_cash: 0, monthly_recurring: 0 })}><Plus />Add lead</Button></header>
    <div className="dashboard-metrics">
      <article className="glass-panel metric-card"><strong>{currency(totals.upfront)}</strong><h2>Pipeline upfront cash</h2><p>Open leads (excludes lost)</p></article>
      <article className="glass-panel metric-card"><strong>{currency(totals.monthly)}</strong><h2>Pipeline monthly recurring</h2><p>Open leads (excludes lost)</p></article>
      <article className="glass-panel metric-card"><strong>{data.leads.length}</strong><h2>Total leads</h2><p>{data.leads.filter((l) => l.status === "CLOSED").length} closed</p></article>
    </div>
    <div className="lead-board">{LEAD_STATUSES.map((s) => { const col = data.leads.filter((l) => (l.status || "TO_CONTACT") === s);
      return <section className="glass-panel lead-column" key={s} aria-label={label(s)}><h2>{s === "CLOSED" ? "Closed" : s === "LOST" ? "Lost" : label(s)} <small>{col.length}</small></h2>
        {col.map((l) => <article key={l.id} className="lead-card"><strong>{l.name}</strong><small>{currency(l.upfront_cash)} upfront · {currency(l.monthly_recurring)}/mo</small>
          <div className="actions"><Button size="icon" variant="ghost" aria-label={`Edit ${l.name}`} onClick={() => setEdit({ id: l.id, name: l.name, channel_url: l.channel_url ?? "", notes: l.notes ?? "", status: (l.status as LeadStatus) || "TO_CONTACT", upfront_cash: l.upfront_cash ?? 0, monthly_recurring: l.monthly_recurring ?? 0 })}><Pencil /></Button>
            <Button size="icon" variant="ghost" aria-label={`Delete ${l.name}`} onClick={async () => { if (!window.confirm(`Delete ${l.name}?`)) return; try { await remove({ data: { id: l.id } }); await cache.invalidateQueries({ queryKey: ["ops"] }); } catch (e) { err(e); } }}><Trash2 /></Button></div></article>)}
      </section>; })}</div>
    {edit && <LeadDialog value={edit} onClose={() => setEdit(null)} />}
  </div>;
}
function LeadDialog({ value, onClose }: { value: LeadForm; onClose: () => void }) {
  const cache = useQueryClient(); const save = useServerFn(saveLead);
  const [f, setF] = useState(value); const [busy, setBusy] = useState(false);
  return <Dialog open onOpenChange={(o) => !o && onClose()}><DialogContent className="agency-modal"><DialogTitle>{value.id ? "Edit lead" : "Add lead"}</DialogTitle><DialogDescription>Prospect details and deal value</DialogDescription>
    <form className="agency-form" onSubmit={async (e) => { e.preventDefault(); setBusy(true); try { await save({ data: f }); await cache.invalidateQueries({ queryKey: ["ops"] }); onClose(); } catch (er) { err(er); } finally { setBusy(false); } }}>
      <label>Name<input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
      <label>Channel URL<input value={f.channel_url} onChange={(e) => setF({ ...f, channel_url: e.target.value })} /></label>
      <label>Status<select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as LeadStatus })}>{LEAD_STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}</select></label>
      <div className="form-grid"><label>Upfront cash<input type="number" min="0" value={f.upfront_cash} onChange={(e) => setF({ ...f, upfront_cash: Number(e.target.value) })} /></label>
        <label>Monthly recurring<input type="number" min="0" value={f.monthly_recurring} onChange={(e) => setF({ ...f, monthly_recurring: Number(e.target.value) })} /></label></div>
      <label>Notes<textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></label>
      <div className="actions"><Button type="button" variant="outline" onClick={onClose}>Close</Button><Button disabled={busy} type="submit">{busy ? "Saving…" : "Save lead"}</Button></div>
    </form></DialogContent></Dialog>;
}

/* ---------------- Onboarding ---------------- */
const steps: [string, string][] = [
  ["Discovery call", "Confirm the client's goals, current channel, offers and how involved they want to be. Decide between Team Only, Personal Involved or a custom plan."],
  ["Send and sign the agreement", "Download the client agreement below, fill in the plan, fees and start date, and have both parties sign before any work begins."],
  ["Collect the setup fee", "Record the setup payment in Money and schedule the first monthly payment so it appears on the Calendar."],
  ["Add the client", "Create the client in Clients with their YouTube channel URL so the channel can be analysed."],
  ["Access and communication", "Get access to the client's Google account for uploads and invite them to a dedicated Discord server for production updates."],
  ["Assign the team", "Allocate an editor, manager and thumbnail designer in Team, checking the capacity tracker so no one is overloaded."],
  ["Kick-off and first content", "Agree a filming schedule, set the production stage to Waiting for footage, and use Ideation and the client's Suggested Ideas to plan the first videos."],
];
export function Onboarding() {
  return <div className="page">
    <header className="page-header"><div><h1>Onboarding</h1><p className="page-subtitle">How to onboard a new client.</p></div>
      <Button asChild><a href="/client-agreement.doc" download="Client-Agreement.doc"><Download />Download client agreement</a></Button></header>
    <section className="glass-panel" style={{ padding: 24 }}>
      <h2>Onboarding guide</h2>
      <ol className="onboarding-guide">{steps.map(([t, d]) => <li key={t}><h3>{t}</h3><p>{d}</p></li>)}</ol>
    </section>
    <section className="glass-panel" style={{ padding: 24 }}><h2>Client agreement</h2><p>Every new client must sign the client agreement during onboarding. Download it, complete the details, and keep a signed copy.</p>
      <Button asChild variant="outline"><a href="/client-agreement.doc" download="Client-Agreement.doc"><Download />Download agreement</a></Button></section>
  </div>;
}
