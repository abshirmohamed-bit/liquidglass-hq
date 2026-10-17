/** Roles and per-role sidebar visibility from the crayZmundo Build Pack, Prompt 1. */
export const ROLES = ["ADMIN", "CLIENT", "CLIPPER"] as const;
export type Role = (typeof ROLES)[number];
export const DEFAULT_ROLE: Role = "CLIPPER";

/** Sidebar order, exactly as listed in Prompt 1. */
export const NAV_ORDER = [
  "Dashboard", "Videos", "Library", "Clips", "Review", "Formats", "Posts", "Campaigns", "Tools",
  "Clients", "Analytics", "Ideation", "Thumbnails", "Money", "Leads", "Team", "Onboarding", "Settings",
] as const;
export type NavTitle = (typeof NAV_ORDER)[number];

const CLIPPER_TABS: NavTitle[] = ["Dashboard", "Videos", "Library", "Clips", "Review", "Formats", "Posts", "Campaigns", "Tools"];
const CLIENT_TABS: NavTitle[] = ["Dashboard", "Videos", "Campaigns", "Review", "Posts", "Analytics"];

export function visibleTabs(role: Role | null | undefined): NavTitle[] {
  if (role === "ADMIN") return [...NAV_ORDER];
  const allowed = role === "CLIENT" ? CLIENT_TABS : role === "CLIPPER" ? CLIPPER_TABS : [];
  return NAV_ORDER.filter((t) => allowed.includes(t));
}

export function canSeeTab(role: Role | null | undefined, title: string): boolean {
  return (visibleTabs(role) as string[]).includes(title);
}

export const roleLabel = (r: Role) => r.charAt(0) + r.slice(1).toLowerCase();
