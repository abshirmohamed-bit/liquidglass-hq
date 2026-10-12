import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Bot, Check, Clock, Copy, Image, NotebookText, Plug, Sparkles, Trash2, Youtube } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { INTEGRATIONS, integrationFor, type IntegrationId } from "@/lib/integration-rules";
import { createTeamLogin, disconnectIntegration, getIntegrations, listTeamLogins, removeTeamLogin, runDiscordSync, testIntegration } from "@/lib/integrations.functions";

export const integrationsQuery = queryOptions({ queryKey: ["integrations"], queryFn: () => getIntegrations(), staleTime: 15000 });
const icons: Record<IntegrationId, typeof Bot> = { ai: Sparkles, higgsfield: Image, youtube: Youtube, discord: Bot, notion: NotebookText };
const badge = { CONNECTED: ["Connected", "tone-green"], NOT_CONFIGURED: ["Not configured", "tone-gray"], ERROR: ["Error", "tone-red"] } as const;

function useSignedIn() {
  const [s, set] = useState(false);
  useEffect(() => { supabase.auth.getSession().then(({ data }) => set(!!data.session)); }, []);
  return s;
}

export function SetupGuide({ id, open, onOpenChange }: { id: IntegrationId | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const test = useServerFn(testIntegration); const cache = useQueryClient();
  const [done, setDone] = useState<number[]>([]); const [busy, setBusy] = useState(false);
  useEffect(() => setDone([]), [id]);
  if (!id) return null;
  const g = integrationFor(id);
  return <Sheet open={open} onOpenChange={onOpenChange}><SheetContent className="setup-guide overflow-y-auto sm:max-w-lg">
    <SheetHeader><SheetTitle>{g.name} setup</SheetTitle><SheetDescription>{g.intro}</SheetDescription>
      <span className="status-pill tone-blue w-fit"><Clock size={12}/>~{g.minutes} min</span></SheetHeader>
    <ol className="guide-steps">{g.steps.map((s, i) => <li key={i} className="glass-panel guide-step">
      <label className="guide-check"><input type="checkbox" checked={done.includes(i)} onChange={e => setDone(e.target.checked ? [...done, i] : done.filter(x => x !== i))}/><strong>{i + 1}. {s.title}</strong></label>
      <p>{s.body}</p>
      {s.code && <button type="button" className="code-copy" onClick={() => { navigator.clipboard.writeText(s.code!); toast.success("Copied"); }}><code>{s.code}</code><Copy size={13}/></button>}
    </li>)}</ol>
    <p className="guide-progress">{done.length} of {g.steps.length} steps checked</p>
    <Button disabled={busy} onClick={async () => { setBusy(true); try { const r = await test({ data: { id } }); r.ok ? toast.success(r.message) : toast.error(r.message); await cache.invalidateQueries({ queryKey: ["integrations"] }); } finally { setBusy(false); } }}><Plug size={15}/>{busy ? "Testing…" : "Test Connection"}</Button>
  </SheetContent></Sheet>;
}

export function IntegrationsPanel({ initialGuide }: { initialGuide?: IntegrationId | undefined }) {
  const q = useQuery(integrationsQuery); const cache = useQueryClient();
  const test = useServerFn(testIntegration); const disconnect = useServerFn(disconnectIntegration); const sync = useServerFn(runDiscordSync);
  const [guide, setGuide] = useState<IntegrationId | null>(initialGuide ?? null);
  const [confirm, setConfirm] = useState<IntegrationId | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const refresh = () => cache.invalidateQueries({ queryKey: ["integrations"] });
  useEffect(() => { if (initialGuide) setGuide(initialGuide); }, [initialGuide]);
  return <section className="settings-section" aria-labelledby="integrations-heading">
    <h2 id="integrations-heading">Integrations</h2>
    <div className="integration-grid">{INTEGRATIONS.map(i => { const s = q.data?.find(x => x.id === i.id); const Icon = icons[i.id]; const [text, tone] = badge[s?.status ?? "NOT_CONFIGURED"];
      return <article key={i.id} className="glass-panel integration-card">
        <header><span className="integration-icon"><Icon size={18}/></span><h3>{i.name}</h3>{i.required && <span className="status-pill tone-blue">Required</span>}{i.optional && <span className="status-pill tone-gray">Optional</span>}</header>
        <span className={`status-pill ${tone}`}>{text}</span>
        <p className="caption">{s?.testedAt ? `Last tested ${new Date(s.testedAt).toLocaleString()}` : "Never tested"}{s?.message ? ` · ${s.message}` : ""}</p>
        {i.id === "discord" && <p className="caption">Read-only — the bot never sends messages. Runs about every 30 minutes.</p>}
        <div className="integration-actions">
          <Button size="sm" variant="outline" onClick={() => setGuide(i.id)}>Setup Guide</Button>
          <Button size="sm" variant="outline" disabled={busy === i.id} onClick={async () => { setBusy(i.id); try { const r = await test({ data: { id: i.id } }); r.ok ? toast.success(r.message) : toast.error(r.message); await refresh(); } finally { setBusy(null); } }}>{busy === i.id ? "Testing…" : "Test"}</Button>
          {i.id === "discord" && s?.status === "CONNECTED" && <Button size="sm" variant="outline" disabled={busy === "sync"} onClick={async () => { setBusy("sync"); try { const r = await sync(); toast.success(`Checked ${r.results.length} client server(s)`); await cache.invalidateQueries({ queryKey: ["agency"] }); } catch (e) { toast.error(e instanceof Error ? e.message : "Sync failed"); } finally { setBusy(null); } }}>Run now</Button>}
          <Button size="sm" variant="ghost" disabled={s?.status === "NOT_CONFIGURED"} onClick={() => setConfirm(i.id)}>Disconnect</Button>
        </div>
      </article>; })}</div>
    <SetupGuide id={guide} open={!!guide} onOpenChange={o => !o && setGuide(null)}/>
    <AlertDialog open={!!confirm} onOpenChange={o => !o && setConfirm(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Disconnect {confirm && integrationFor(confirm).name}?</AlertDialogTitle><AlertDialogDescription>Features using it will show as not configured. Run Test again to reconnect.</AlertDialogDescription></AlertDialogHeader>
      <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={async () => { if (confirm) { await disconnect({ data: { id: confirm } }); await refresh(); } }}>Disconnect</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </section>;
}

export function IntegrationBanner({ id }: { id: IntegrationId }) {
  const signedIn = useSignedIn();
  const q = useQuery({ ...integrationsQuery, enabled: signedIn });
  const s = q.data?.find(x => x.id === id);
  if (!s || s.status === "CONNECTED") return null;
  return <div className="glass-panel integration-banner"><span><Plug size={15}/>This feature requires {integrationFor(id).name} to be configured.</span><Link to="/settings" search={{ guide: id }}>Set it up now <ArrowRight size={14}/></Link></div>;
}

export function WelcomeModal() {
  const signedIn = useSignedIn(); const navigate = useNavigate();
  const q = useQuery({ ...integrationsQuery, enabled: signedIn });
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!q.data || localStorage.getItem("agency-welcome-done")) return;
    if (q.data.filter(x => x.id !== "ai").every(x => x.status !== "CONNECTED")) setOpen(true);
  }, [q.data]);
  const close = () => { localStorage.setItem("agency-welcome-done", "1"); setOpen(false); };
  return <Dialog open={open} onOpenChange={o => !o && close()}><DialogContent className="welcome-modal sm:max-w-xl">
    <DialogHeader><DialogTitle>Welcome to Agency Admin</DialogTitle><DialogDescription>Connect these in order to unlock every tool.</DialogDescription></DialogHeader>
    <ol className="welcome-list">{INTEGRATIONS.map(i => { const Icon = icons[i.id]; const s = q.data?.find(x => x.id === i.id);
      return <li key={i.id} className="glass-panel"><Icon size={16}/><span>{i.name}</span>{i.required ? <span className="status-pill tone-blue">Required</span> : i.optional ? <span className="status-pill tone-gray">Optional</span> : null}{s?.status === "CONNECTED" && <Check size={14} className="ml-auto"/>}</li>; })}</ol>
    <Button onClick={() => { close(); navigate({ to: "/settings", search: { guide: "ai" } }); }}>Get Started</Button>
    <button type="button" className="link-button" onClick={close}>Skip for now</button>
  </DialogContent></Dialog>;
}

export function TeamAccess() {
  const list = useServerFn(listTeamLogins); const create = useServerFn(createTeamLogin); const remove = useServerFn(removeTeamLogin);
  const q = useQuery({ queryKey: ["team-logins"], queryFn: () => list() }); const cache = useQueryClient();
  const [f, setF] = useState({ name: "", email: "", password: "" }); const [busy, setBusy] = useState(false);
  if (q.data && !q.data.isOwner) return null;
  return <section className="settings-section" aria-labelledby="team-access-heading">
    <h2 id="team-access-heading">Team logins</h2>
    <p className="caption">Team members sign in at this app's address from any network and see the agency's records.</p>
    <form className="glass-panel team-login-form" onSubmit={async e => { e.preventDefault(); setBusy(true); try { await create({ data: f }); toast.success(`Login created for ${f.email}`); setF({ name: "", email: "", password: "" }); await cache.invalidateQueries({ queryKey: ["team-logins"] }); } catch (er) { toast.error(er instanceof Error ? er.message : "Could not create login"); } finally { setBusy(false); } }}>
      <input aria-label="Team member name" placeholder="Name" required value={f.name} onChange={e => setF({ ...f, name: e.target.value })}/>
      <input aria-label="Team member email" placeholder="Email" type="email" required value={f.email} onChange={e => setF({ ...f, email: e.target.value })}/>
      <input aria-label="Team member password" placeholder="Temporary password (8+)" type="password" minLength={8} required value={f.password} onChange={e => setF({ ...f, password: e.target.value })}/>
      <Button type="submit" disabled={busy}>{busy ? "Creating…" : "Create login"}</Button>
    </form>
    <ul className="team-login-list">{(q.data?.logins ?? []).map(l => <li key={l.id} className="glass-panel"><strong>{l.name}</strong><span>{l.email}</span><span className="caption">Added {new Date(l.created_at).toLocaleDateString()}</span>
      <Button size="icon" variant="ghost" aria-label={`Remove ${l.email}`} onClick={async () => { if (!confirm(`Remove ${l.email}'s login?`)) return; try { await remove({ data: { id: l.id } }); await cache.invalidateQueries({ queryKey: ["team-logins"] }); } catch (er) { toast.error(String(er)); } }}><Trash2/></Button></li>)}
      {q.data && !q.data.logins.length && <li className="caption">No team logins yet.</li>}</ul>
  </section>;
}
