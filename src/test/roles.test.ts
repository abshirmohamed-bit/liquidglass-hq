import { describe, expect, it } from "vitest";
import { DEFAULT_ROLE, NAV_ORDER, canSeeTab, visibleTabs } from "@/lib/roles";

describe("roles", () => {
  it("leads with Videos, the one place a clip is made", () => {
    expect(NAV_ORDER).toEqual([
      "Dashboard",
      "Videos",
      "Library",
      "Clips",
      "Review",
      "Formats",
      "Posts",
      "Campaigns",
      "Tools",
      "Clients",
      "Analytics",
      "Ideation",
      "Thumbnails",
      "Money",
      "Leads",
      "Team",
      "Onboarding",
      "Settings",
    ]);
  });
  it("new users default to CLIPPER", () => expect(DEFAULT_ROLE).toBe("CLIPPER"));
  it("clippers see the clip-making tabs", () => {
    expect(visibleTabs("CLIPPER")).toEqual([
      "Dashboard",
      "Videos",
      "Library",
      "Clips",
      "Review",
      "Formats",
      "Posts",
      "Campaigns",
      "Tools",
    ]);
  });
  it("clients see only what concerns their work", () => {
    expect(visibleTabs("CLIENT")).toEqual([
      "Dashboard",
      "Videos",
      "Review",
      "Posts",
      "Campaigns",
      "Analytics",
    ]);
    for (const t of ["Money", "Leads", "Team", "Settings"])
      expect(canSeeTab("CLIENT", t)).toBe(false);
  });
  it("admins see every tab", () => expect(visibleTabs("ADMIN")).toHaveLength(NAV_ORDER.length));
});
