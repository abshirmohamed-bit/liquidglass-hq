import { useEffect, useState, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { PanelLeftClose, PanelLeftOpen, Sun, Moon, Layers2, ChevronDown, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { agencyPages } from './pages';
export function AgencyShell({children, signedIn}: {children:ReactNode; signedIn:boolean}) {
 const [collapsed,setCollapsed]=useState(false);
 const [light,setLight]=useState(false);
 useEffect(()=>{setLight(localStorage.getItem('agency-theme')==='light');},[]);
 useEffect(()=>{document.documentElement.classList.toggle('light',light);},[light]);
 function toggleTheme(){ const next=!light; setLight(next);localStorage.setItem('agency-theme',next?'light':'dark'); }
  return <div className="app-shell"><header className="topbar"><Link to="/" className="brand"><span className="brand-mark"><Layers2 size={19}/></span><span>Agency Admin</span></Link><div className="top-actions"><span className="workspace-pill"><span className="status-dot"/>Internal workspace</span><Button variant="ghost" size="icon" aria-label={light?'Switch to dark mode':'Switch to light mode'} title={light?'Dark mode':'Light mode'} onClick={toggleTheme}>{light?<Moon/>:<Sun/>}</Button></div></header><div className="app-body"><aside className={`agency-sidebar ${collapsed?'collapsed':''}`}><p className="sidebar-label">Workspace</p><nav className="nav-list" aria-label="Main navigation">{agencyPages.map(p=><Link key={p.path} to={p.path} activeOptions={{exact:true}} className="nav-link" title={p.title}><p.icon/>{!collapsed&&<span className="nav-text">{p.title}</span>}</Link>)}</nav><div className="sidebar-bottom"><Button variant="ghost" className="w-full text-muted-foreground" onClick={()=>setCollapsed(!collapsed)} aria-label={collapsed?'Expand sidebar':'Collapse sidebar'} title={collapsed?'Expand sidebar':'Collapse sidebar'}>{collapsed?<PanelLeftOpen/>:<><PanelLeftClose/><span className="nav-text">Collapse sidebar</span></>}</Button><div className="sidebar-divider"/><Link to="/auth" className="account-link" title="Account"><span className="account-avatar"><UserRound size={15}/></span>{!collapsed&&<><div className="account-copy min-w-0"><div className="text-xs font-medium">Agency account</div><div className="account-caption">{signedIn?'Manage account':'Sign in'}</div></div><ChevronDown size={13} className="account-copy ml-auto text-muted-foreground"/></>}</Link></div></aside><main className="main-area"><div className="liquid-background"/>{children}</main></div></div>;
}
