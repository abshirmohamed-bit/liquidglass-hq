import { describe, expect, it } from "vitest";
import { detectProvider, looksLikeModel } from "@/lib/ai/provider.server";

describe("own AI key provider", () => {
  it("recognises a Cheaper Inference key", () => {
    expect(detectProvider("ci_live_abc").baseURL).toBe("https://api.cheaperinference.com/v1");
  });
  it("ignores placeholder model names like NA", () => {
    expect(looksLikeModel("NA")).toBe(false);
    expect(looksLikeModel("cheaperinference")).toBe(false);
    expect(looksLikeModel("gpt-5.4-mini")).toBe(true);
  });
});
