export const LEAD_STATUSES = ["TO_CONTACT", "CONTACTED", "IN_TALKS", "CLOSED", "LOST"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];
/** A team member handling more clients than this is flagged as overloaded. */
export const MAX_CLIENTS_PER_MEMBER = 3;

type Pay = { amount: number; status: string | null; paid_date: string | null };
export function revenueThisMonth(payments: readonly Pay[], today: string) {
  const month = today.slice(0, 7);
  return payments.filter((p) => p.status === "PAID" && p.paid_date?.startsWith(month)).reduce((s, p) => s + p.amount, 0);
}

export function capacity(team: readonly { name: string; role: string | null; client_id: string }[]) {
  const map = new Map<string, { name: string; role: string | null; clients: Set<string> }>();
  for (const m of team) {
    const key = m.name.trim().toLowerCase();
    const row = map.get(key) ?? { name: m.name.trim(), role: m.role, clients: new Set<string>() };
    row.clients.add(m.client_id);
    map.set(key, row);
  }
  return [...map.values()].map((r) => ({ name: r.name, role: r.role, count: r.clients.size, overloaded: r.clients.size > MAX_CLIENTS_PER_MEMBER })).sort((a, b) => b.count - a.count);
}

export function pipelineTotals(leads: readonly { status: string | null; upfront_cash: number | null; monthly_recurring: number | null }[]) {
  const open = leads.filter((l) => l.status !== "LOST");
  return {
    upfront: open.reduce((s, l) => s + (l.upfront_cash ?? 0), 0),
    monthly: open.reduce((s, l) => s + (l.monthly_recurring ?? 0), 0),
  };
}

/** Monday-first grid of ISO dates for the month containing `month` (YYYY-MM). Blank cells are null. */
export function monthGrid(month: string) {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const first = new Date(Date.UTC(y, m - 1, 1));
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7;
  const cells: (string | null)[] = Array(lead).fill(null);
  for (let d = 1; d <= days; d++) cells.push(`${month}-${String(d).padStart(2, "0")}`);
  while (cells.length % 7) cells.push(null);
  return cells;
}
