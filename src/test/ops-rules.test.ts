import { describe, expect, it } from "vitest";
import { capacity, monthGrid, pipelineTotals, revenueThisMonth } from "@/lib/ops-rules";

describe("operations rules", () => {
  it("counts only payments collected this month", () => {
    expect(revenueThisMonth([
      { amount: 500, status: "PAID", paid_date: "2026-10-03" },
      { amount: 900, status: "PAID", paid_date: "2026-09-30" },
      { amount: 700, status: "PENDING", paid_date: null },
    ], "2026-10-12")).toBe(500);
  });
  it("flags members on more than 3 clients", () => {
    const team = ["a", "b", "c", "d"].map((client_id) => ({ name: "Sam", role: "EDITOR", client_id }));
    expect(capacity([...team, { name: "Jo", role: "MANAGER", client_id: "a" }])).toEqual([
      { name: "Sam", role: "EDITOR", count: 4, overloaded: true },
      { name: "Jo", role: "MANAGER", count: 1, overloaded: false },
    ]);
  });
  it("pipeline totals exclude lost leads", () => {
    expect(pipelineTotals([
      { status: "IN_TALKS", upfront_cash: 30000, monthly_recurring: 5000 },
      { status: "LOST", upfront_cash: 10000, monthly_recurring: 2000 },
    ])).toEqual({ upfront: 30000, monthly: 5000 });
  });
  it("builds a Monday-first month grid", () => {
    const g = monthGrid("2026-10");
    expect(g[3]).toBe("2026-10-01"); // Oct 1 2026 is a Thursday
    expect(g.length % 7).toBe(0);
  });
});
