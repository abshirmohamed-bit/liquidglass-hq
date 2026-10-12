import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { PanelLeftClose, PanelLeftOpen, Sun, Moon, Layers2, ChevronDown, UserRound, LogOut, LockKeyhole } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { supabase } from '@/integrations/supabase/client';
import { meQuery } from '@/lib/me-query';
import { canSeeTab, roleLabel, visibleTabs } from '@/lib/roles';
import { clipBadge } from '@/lib/clip.functions';
import { agencyPages, extraPages } from './pages';

function AccountMenu() {
 const me = useQuery(meQuery).data; const navigate = useNavigate();
 const badgeCount = useQuery({ queryKey: ["clip-badge"], enabled: !!me, queryFn: () => clipBadge(), refetchInterval: 15000 }).data?.found ?? 0;
 if (!me) return <Button asChild variant="outline" size="sm"><Link to="/auth">Sign in</Link></Button>;
 return <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="sm" className="account-menu-trigger" aria-label="Account menu"><span className="account-avatar"><UserRound size={14}/></span><span className="account-menu-name">{me.name}</span><span className="status-pill tone-blue">{roleLabel(me.role)}</span><ChevronDown size={13}/></Button></DropdownMenuTrigger>
  <DropdownMenuContent align="end" className="min-w-56"><DropdownMenuLabel><div className="text-sm font-medium">{me.name}</div><div className="caption">{me.email} · {roleLabel(me.role)}</div></DropdownMenuLabel><DropdownMenuSeparator/>
   <DropdownMenuItem onClick={async()=>{await supabase.auth.signOut();navigate({to:'/auth'});}}><LogOut size={14}/>Sign out</DropdownMenuItem></DropdownMenuContent></DropdownMenu>;
}

export function AgencyShell({children, signedIn}: {children:ReactNode; signedIn:boolean}) {
 const [collapsed,setCollapsed]=useState(false);
 const [light,setLight]=useState(true);
 const me = useQuery({...meQuery, enabled: signedIn}).data;
 const badgeCount = useQuery({ queryKey: ["clip-badge"], enabled: signedIn, queryFn: () => clipBadge(), refetchInterval: 15000 }).data?.found ?? 0;
 const role = signedIn ? me?.role : null;
 const path = useLocation({select: l => l.pathname});
 useEffect(()=>{setLight(localStorage.getItem('agency-theme')!=='dark');},[]);
 useEffect(()=>{document.documentElement.classList.toggle('light',light);document.documentElement.classList.toggle('dark',!light);},[light]);
 function toggleTheme(){ const next=!light; setLight(next);localStorage.setItem('agency-theme',next?'light':'dark'); }
 // Signed-out visitors still see the full shell (public placeholder pages); signed-in users see only their role's tabs.
 const tabs = role ? visibleTabs(role) : agencyPages.map(p=>p.title);
 const pages = agencyPages.filter(p => (tabs as string[]).includes(p.title));
 const current = [...agencyPages, ...extraPages].filter(p => p.path !== '/').find(p => path === p.path || path.startsWith(p.path + '/'));
 const blocked = !!role && !!current && role !== 'ADMIN' && !canSeeTab(role, current.title);
 return <div className="app-shell"><header className="topbar"><Link to="/" className="brand"><span className="brand-mark"><Layers2 size={14}/></span><span>crayZmundo</span></Link><div className="top-actions"><Button variant="ghost" size="icon" aria-label={light?'Switch to dark mode':'Switch to light mode'} title={light?'Dark mode':'Light mode'} onClick={toggleTheme}>{light?<Moon/>:<Sun/>}</Button>{signedIn && <AccountMenu/>}</div></header><div className="app-body"><aside className={`agency-sidebar ${collapsed?'collapsed':''}`}><Button variant="ghost" className="sidebar-collapse text-muted-foreground" onClick={()=>setCollapsed(!collapsed)} aria-label={collapsed?'Expand sidebar':'Collapse sidebar'} title={collapsed?'Expand sidebar':'Collapse sidebar'}>{collapsed?<PanelLeftOpen/>:<><PanelLeftClose/><span className="nav-text">Collapse</span></>}</Button><nav className="nav-list" aria-label="Main navigation">{pages.map(p=><Link key={p.path} to={p.path} activeOptions={{exact:true}} className="nav-link" title={p.title}><p.icon/>{!collapsed&&<span className="nav-text">{p.title}</span>}{p.title==='Review' && !collapsed && badgeCount>0 && <span className="nav-badge" aria-label={`${badgeCount} clips to review`}>{badgeCount}</span>}</Link>)}</nav><div className="sidebar-bottom"><Link to="/auth" className="account-link" title="Account"><span className="account-avatar"><UserRound size={15}/></span>{!collapsed&&<><div className="account-copy min-w-0"><div className="text-xs font-medium">{me?.name ?? 'Agency account'}</div><div className="account-caption">{signedIn?(me?roleLabel(me.role):'Manage account'):'Sign in'}</div></div><ChevronDown size={13} className="account-copy ml-auto text-muted-foreground"/></>}</Link></div></aside><main className="main-area"><div className="liquid-background"/>{blocked ? <div className="page"><section className="glass-panel placeholder-panel" aria-label="No access"><div className="placeholder-inner"><div className="empty-icon"><LockKeyhole/></div><h2>You don’t have access to {current!.title}</h2><span className="panel-label">Ask an admin if you need it.</span></div></section></div> : children}</main></div></div>;
}
