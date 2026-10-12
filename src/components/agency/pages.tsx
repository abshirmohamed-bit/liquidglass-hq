import { LayoutDashboard, Wallet, Users, CalendarDays, Target, Lightbulb, Image, ChartNoAxesCombined, UserRoundCog, Rocket, Settings, ChevronRight, LockKeyhole, type LucideIcon } from 'lucide-react';
export const agencyPages: {title: string; path: string; icon: LucideIcon; subtitle: string}[] = [
 {title:'Dashboard', path:'/', icon:LayoutDashboard, subtitle:'A clear view of your agency.'},
 {title:'Money', path:'/money', icon:Wallet, subtitle:'Your revenue, payments, and margins.'},
 {title:'Clients', path:'/clients', icon:Users, subtitle:'The people and brands you’re building.'},
 {title:'Calendar', path:'/calendar', icon:CalendarDays, subtitle:'Everything ahead, in one place.'},
 {title:'Leads', path:'/leads', icon:Target, subtitle:'Your next great partnerships.'},
 {title:'Ideation', path:'/ideation', icon:Lightbulb, subtitle:'The starting point for something great.'},
 {title:'Thumbnails', path:'/thumbnails', icon:Image, subtitle:'Make every first impression count.'},
 {title:'Analytics', path:'/analytics', icon:ChartNoAxesCombined, subtitle:'The numbers behind the growth.'},
 {title:'Team', path:'/team', icon:UserRoundCog, subtitle:'Great content starts with great people.'},
 {title:'Onboarding', path:'/onboarding', icon:Rocket, subtitle:'A thoughtful start for every client.'},
 {title:'Settings', path:'/settings', icon:Settings, subtitle:'Your agency, your preferences.'},
];
export function pageHead(title: string) {
 const description = `${title} workspace for crayZmundo, your internal content agency app.`;
 return {meta:[{title:`${title} · crayZmundo`},{name:'description',content:description},{property:'og:title',content:`${title} · crayZmundo`},{property:'og:description',content:description},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary_large_image'}]};
}
export function AgencyPage({title}: {title:string}) {
 const page = agencyPages.find(p=>p.title===title);
 if (!page) return null;
 const Icon=page.icon;
 return <div className="page"><div className="breadcrumb"><span>Workspace</span><ChevronRight/><span>{title}</span></div><header className="page-header"><div className="min-w-0"><h1>{title}</h1><p className="page-subtitle">{page.subtitle}</p></div><span className="section-tag">Agency workspace</span></header><section className="glass-panel placeholder-panel" aria-label={`${title} coming soon`}><div className="placeholder-inner"><div className="empty-icon"><Icon/></div><h2>Coming soon</h2><span className="panel-label">{title}</span></div><div className="panel-footer"><span>crayZmundo</span><LockKeyhole/></div></section><footer className="page-footer"><span>Your agency. All together.</span><span>crayZmundo</span></footer></div>;
}
