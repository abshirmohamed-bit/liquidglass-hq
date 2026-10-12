import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { ArrowRight, Bot, ListChecks, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { agencyQuery } from '@/lib/agency-query';
import { opsQuery } from '@/lib/ops-query';
import { currency, financialSummary } from '@/lib/finance';
import { revenueThisMonth } from '@/lib/ops-rules';
import { label } from '@/lib/agency-rules';
import { clientStats } from '@/lib/analytics-rules';
import { addObjective, deleteObjective, toggleObjective } from '@/lib/ops.functions';

const stageTone: Record<string, string> = { WAITING_FOR_FOOTAGE: 'tone-orange', FILMING: 'tone-purple', EDITING_SHORT_FORM: 'tone-blue', EDITING_LONG_FORM: 'tone-blue', DESIGNING_THUMBNAIL: 'tone-teal', IN_REVIEW: 'tone-orange', UPLOADING: 'tone-teal', PUBLISHED: 'tone-green' };

export function Dashboard() {
 const [signedIn, setSignedIn] = useState<boolean | null>(null);
 useEffect(() => { supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session)); }, []);
 const agency = useQuery({ ...agencyQuery, enabled: !!signedIn });
 const ops = useQuery({ ...opsQuery, enabled: !!signedIn });
 const cache = useQueryClient();
 const add = useServerFn(addObjective); const toggle = useServerFn(toggleObjective); const remove = useServerFn(deleteObjective);
 const [text, setText] = useState('');
 const today = new Date().toISOString().slice(0, 10);
 const d = agency.data; const o = ops.data;
 const summary = d ? financialSummary(d.clients, d.payments, d.team) : null;
 const metrics = [
  { value: summary ? currency(summary.mrr) : '—', label: 'Total MRR', detail: d ? `${d.clients.filter(c => c.status === 'ACTIVE').length} active clients` : 'Sign in to see totals' },
  { value: d ? String(d.clients.length) : '—', label: 'Total clients', detail: 'All clients on record' },
  { value: d ? currency(revenueThisMonth(d.payments, today)) : '—', label: `Revenue in ${new Intl.DateTimeFormat('en', { month: 'long', timeZone: 'UTC' }).format(new Date())}`, detail: 'Payments collected this month' },
  { value: summary ? currency(summary.outstanding) : '—', label: 'Outstanding payments', detail: 'Billed but not yet collected' },
 ];
 const todays = (o?.objectives ?? []).filter(x => x.day === today);
 const watch = d ? d.clients.map(c => { const rows = clientStats(d.snapshots, c.id).rows; const cutoff = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10); const recent = rows.filter(r => (r.date ?? '') >= cutoff); const first = recent[0]; const last = recent[recent.length - 1];
  return { name: c.name, change: first && last && first !== last ? (last.views ?? 0) - (first.views ?? 0) : null }; }) : [];
 const refresh = () => cache.invalidateQueries({ queryKey: ['ops'] });
 return <div className="page dashboard-page">
  <div className="glass-panel integration-banner"><span><Bot size={15}/>Discord bot is not configured.</span><Link to="/settings">Set it up now <ArrowRight size={14}/></Link></div>
  <header className="page-header"><div><h1>Dashboard</h1><p className="page-subtitle">Where the agency stands today — revenue, clients in production, and the objectives that keep them.</p></div></header>
  {signedIn === false && <p className="notice"><Link to="/auth">Sign in</Link> to see your agency’s numbers.</p>}
  <div className="dashboard-metrics">{metrics.map(metric => <article className="glass-panel metric-card" key={metric.label}><strong>{metric.value}</strong><h2>{metric.label}</h2><p>{metric.detail}</p></article>)}</div>
  <section className="production-section"><h2>Client production stages</h2>
   {d?.clients.length ? <div className="stage-cards">{d.clients.map(c => { const stage = d.progress.find(p => p.client_id === c.id)?.stage || 'WAITING_FOR_FOOTAGE';
    return <Link key={c.id} to="/clients/$clientId" params={{ clientId: c.id }} className="glass-panel stage-card"><strong>{c.name}</strong><span className={`stage-pill status-pill ${stageTone[stage] ?? ''}`}>{label(stage)}</span></Link>; })}</div> : <p>No clients yet.</p>}
  </section>
  <section className="glass-panel objectives-panel" aria-labelledby="objectives-heading">
   <header><h2 id="objectives-heading"><ListChecks size={16}/>Daily Objectives</h2><span>Client growth watch</span></header>
   <div className="growth-notice">Keep client growth and daily priorities in view.</div>
   <div className="objective-section"><h3>30-day views watch</h3>{watch.some(w => w.change != null) ? watch.filter(w => w.change != null).map(w => <p key={w.name}>{w.name}: <strong className={w.change! < 0 ? 'text-destructive' : ''}>{w.change! >= 0 ? '+' : ''}{w.change!.toLocaleString()} views</strong></p>) : <p>Needs two analytics snapshots in the last 30 days.</p>}</div>
   <div className="objective-section"><h3>Today’s to-dos</h3>{todays.length ? todays.map(x => <label key={x.id} className="objective-item"><input type="checkbox" checked={x.done} onChange={async e => { try { await toggle({ data: { id: x.id, done: e.target.checked } }); await refresh(); } catch (er) { toast.error(String(er)); } }}/><span style={{ textDecoration: x.done ? 'line-through' : undefined }}>{x.text}</span><Button size="icon" variant="ghost" aria-label={`Delete ${x.text}`} onClick={async e => { e.preventDefault(); await remove({ data: { id: x.id } }); await refresh(); }}><Trash2/></Button></label>) : <p>No objectives yet.</p>}</div>
   <form className="objective-entry" onSubmit={async e => { e.preventDefault(); if (!text.trim()) return; try { await add({ data: { text, day: today } }); setText(''); await refresh(); } catch (er) { toast.error(er instanceof Error ? er.message : 'Could not add'); } }}>
    <input aria-label="Daily objective" placeholder="Add an objective for today…" disabled={!signedIn} value={text} onChange={e => setText(e.target.value)}/><Button type="submit" disabled={!signedIn || !text.trim()}><Plus size={15}/>Add</Button>
   </form>
  </section>
 </div>;
}
