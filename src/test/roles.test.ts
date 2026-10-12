import { describe, expect, it } from "vitest";
import { DEFAULT_ROLE, NAV_ORDER, canSeeTab, visibleTabs } from "@/lib/roles";

describe("roles (Build Pack Prompt 1)", () => {
  it("orders the sidebar exactly as the prompt lists", () => {
    expect(NAV_ORDER).toEqual(["Dashboard", "Library", "Clips", "Review", "Formats", "Posts", "Campaigns", "Tools", "Clients", "Analytics", "Ideation", "Thumbnails", "Money", "Leads", "Team", "Onboarding", "Settings"]);
  });
  it("new users default to CLIPPER", () => expect(DEFAULT_ROLE).toBe("CLIPPER"));
  it("clippers see only the eight clipper tabs", () => {
    expect(visibleTabs("CLIPPER")).toEqual(["Dashboard", "Library", "Clips", "Review", "Formats", "Posts", "Campaigns", "Tools"]);
  });
  it("clients see only Dashboard, Campaigns, Review, Posts, Analytics", () => {
    expect(visibleTabs("CLIENT")).toEqual(["Dashboard", "Review", "Posts", "Campaigns", "Analytics"]);
    for (const t of ["Money", "Leads", "Team", "Settings"]) expect(canSeeTab("CLIENT", t)).toBe(false);
  });
  it("admins see all 17 tabs", () => expect(visibleTabs("ADMIN")).toHaveLength(17));
});
