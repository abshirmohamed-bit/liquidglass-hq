import { describe, expect, it } from "vitest";
import { knowledgeBlock, knowledgeScope, MAX_TRAINING_CHARS } from "@/lib/training-rules";
describe("training rules", () => {
  it("thumbnail trainer saves global entries as THUMBNAIL_GLOBAL", () => expect(knowledgeScope("THUMBNAIL", null)).toBe("THUMBNAIL_GLOBAL"));
  it("video trainer saves global entries as VIDEO_GLOBAL", () => expect(knowledgeScope("VIDEO", null)).toBe("VIDEO_GLOBAL"));
  it("client entries get a client scope", () => expect(knowledgeScope("THUMBNAIL", "c1")).toBe("THUMBNAIL_CLIENT"));
  it("accepts very large training pastes", () => expect(MAX_TRAINING_CHARS).toBeGreaterThanOrEqual(1_000_000));
  it("injects every principle", () => expect(knowledgeBlock("K", ["a", null, "b"])).toBe("K:\n- a\n- b"));
});
