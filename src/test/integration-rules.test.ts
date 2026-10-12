import { describe, expect, it } from "vitest";
import { INTEGRATIONS, integrationStatus, matchClientByServerName, parseStage, STAGES } from "@/lib/integration-rules";

describe("integration rules", () => {
  it("lists integrations in the recommended order with AI required", () => {
    expect(INTEGRATIONS.map((i) => i.id)).toEqual(["engine", "ai", "anthropic", "higgsfield", "youtube", "instagram", "tiktok", "x", "discord", "notion"]);
    expect(INTEGRATIONS.find((i) => i.id === "ai")?.required).toBe(true);
    expect(INTEGRATIONS.find((i) => i.id === "notion")!.optional).toBe(true);
  });
  it("uses the guide time estimates from the document", () => {
    const m = Object.fromEntries(INTEGRATIONS.map((i) => [i.id, i.minutes]));
    expect(["ai", "higgsfield", "youtube", "discord", "notion"].map((k) => m[k])).toEqual([2, 3, 5, 5, 4]);
  });
  it("uses the exact Build Pack secret names", () => {
    const all = INTEGRATIONS.flatMap((i) => i.secrets);
    for (const n of ["ENGINE_API_KEY", "ENGINE_WEBHOOK_SECRET", "HIGGSFIELD_API_KEY", "HIGGSFIELD_SECRET", "YOUTUBE_API_KEY", "INSTAGRAM_APP_SECRET", "TIKTOK_CLIENT_SECRET", "X_CLIENT_SECRET", "ANTHROPIC_API_KEY"]) expect(all).toContain(n);
    expect(all.some((n) => /crayo/i.test(n))).toBe(false);
  });
  it("derives status badges", () => {
    expect(integrationStatus(false, false, null)).toBe("NOT_CONFIGURED");
    expect(integrationStatus(true, true, true)).toBe("NOT_CONFIGURED");
    expect(integrationStatus(true, false, false)).toBe("ERROR");
    expect(integrationStatus(true, false, null)).toBe("CONNECTED");
  });
  it("matches Discord servers to clients by name, not ID", () => {
    const clients = [{ name: "Jane Doe" }, { name: "Acme Co." }];
    expect(matchClientByServerName("jane doe", clients)?.name).toBe("Jane Doe");
    expect(matchClientByServerName("ACME CO", clients)?.name).toBe("Acme Co.");
    expect(matchClientByServerName("Other", clients)).toBeUndefined();
  });
  it("can parse every stage, not just the first", () => {
    for (const s of STAGES) expect(parseStage(`${s}\nReason: team said so`)).toBe(s);
    expect(parseStage("Stage: EDITING_LONG_FORM — editor is cutting")).toBe("EDITING_LONG_FORM");
    expect(parseStage("unclear")).toBeNull();
  });
});
