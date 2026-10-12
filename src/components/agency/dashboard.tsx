import { Link } from '@tanstack/react-router';
import { ArrowRight, Bot, ListChecks, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Presentation-only shell: operational metrics and objectives arrive with Prompt 9.
export function Dashboard() {
 const metrics = [
  { value: '—', label: 'Total MRR', detail: 'No revenue data yet' },
  { value: '—', label: 'Total clients', detail: 'Client totals not connected yet' },
  { value: '—', label: `Revenue in ${new Intl.DateTimeFormat('en', { month: 'long', timeZone: 'UTC' }).format(new Date())}`, detail: 'Payments collected this month' },
  { value: '—', label: 'Outstanding payments', detail: 'Payment totals not connected yet' },
 ];
 return <div className="page dashboard-page">
  <div className="glass-panel integration-banner"><span><Bot size={15}/>Discord bot is not configured.</span><Link to="/settings">Set it up now <ArrowRight size={14}/></Link></div>
  <header className="page-header"><div><h1>Dashboard</h1><p className="page-subtitle">Where the agency stands today — revenue, clients in production, and the objectives that keep them.</p></div></header>
  <div className="dashboard-metrics">{metrics.map(metric => <article className="glass-panel metric-card" key={metric.label}><strong>{metric.value}</strong><h2>{metric.label}</h2><p>{metric.detail}</p></article>)}</div>
  <section className="production-section"><h2>Client production stages</h2><p>Production tracking will appear here once Discord is connected.</p><p>No production updates yet.</p></section>
  <section className="glass-panel objectives-panel" aria-labelledby="objectives-heading">
   <header><h2 id="objectives-heading"><ListChecks size={16}/>Daily Objectives</h2><span>Client growth watch</span></header>
   <div className="growth-notice">Keep client growth and daily priorities in view.</div>
   <div className="objective-section"><h3>30-day views watch</h3><p>No growth tracking connected yet.</p></div>
   <div className="objective-section"><h3>Today’s to-dos</h3><p>No objectives yet.</p></div>
   <div className="objective-entry"><input aria-label="Daily objective" placeholder="Add an objective for today…" disabled/><Button disabled title="Objectives will be available when dashboard setup is complete"><Plus size={15}/>Add</Button></div>
  </section>
 </div>;
}