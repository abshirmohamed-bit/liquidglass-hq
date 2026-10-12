import { describe, expect, it } from "vitest";
import { INTEGRATIONS, integrationStatus, matchClientByServerName, parseStage, STAGES } from "@/lib/integration-rules";

describe("integration rules", () => {
  it("lists integrations in the recommended order with AI required", () => {
    expect(INTEGRATIONS.map((i) => i.id)).toEqual(["ai", "higgsfield", "youtube", "discord", "notion"]);
    expect(INTEGRATIONS[0].required).toBe(true);
    expect(INTEGRATIONS.find((i) => i.id === "notion")!.optional).toBe(true);
  });
  it("uses the guide time estimates from the document", () => {
    expect(Object.fromEntries(INTEGRATIONS.map((i) => [i.id, i.minutes]))).toEqual({ ai: 2, higgsfield: 3, youtube: 5, discord: 5, notion: 4 });
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
