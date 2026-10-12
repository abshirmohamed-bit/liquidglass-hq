import { describe, expect, it } from "vitest";
import { clientScope, lastLongForm, TITLES_PER_VIDEO } from "@/lib/suggestion-rules";

describe("client suggestion rules", () => {
  it("uses only the last 5 long-form uploads, newest first", () => {
    const vids = Array.from({ length: 8 }, (_, i) => ({ publishedAt: `2026-01-0${i + 1}`, seconds: i === 7 ? 30 : 600 }));
    const picked = lastLongForm(vids);
    expect(picked).toHaveLength(5);
    expect(picked[0].publishedAt).toBe("2026-01-07");
  });
  it("asks for 3 titles per video (15 total)", () => expect(TITLES_PER_VIDEO * 5).toBe(15));
  it("saves feedback under client-specific scopes", () => {
    expect(clientScope("TITLES")).toBe("CLIENT_TITLES");
    expect(clientScope("IDEAS")).toBe("CLIENT_IDEAS");
  });
});
