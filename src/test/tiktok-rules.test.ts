import { describe, expect, it } from "vitest";
import { chunkPlan, DEFAULT_TIKTOK_OPTIONS as D, postInfo, tiktokOptionsIssue } from "@/lib/tiktok-rules";

const MB = 1024 * 1024;
describe("TikTok direct post rules", () => {
  it("requires the user to pick privacy (no default)", () => expect(tiktokOptionsIssue(D, [], 30, null)).toMatch(/Choose/));
  it("blocks private branded content", () => expect(tiktokOptionsIssue({ ...D, privacy: "SELF_ONLY", disclose: true, brandedContent: true }, [], 30, null)).toMatch(/private/));
  it("needs a disclosure type when disclosing", () => expect(tiktokOptionsIssue({ ...D, privacy: "SELF_ONLY", disclose: true }, [], 30, null)).toMatch(/promotes/));
  it("respects the account's max duration", () => expect(tiktokOptionsIssue({ ...D, privacy: "SELF_ONLY" }, [], 700, 600)).toMatch(/600/));
  it("interactions are off unless ticked", () => expect(postInfo("x", { ...D, privacy: "SELF_ONLY" })).toMatchObject({ disable_comment: true, disable_duet: true, disable_stitch: true }));
  it("single chunk up to 64 MB, 10 MB chunks above", () => {
    expect(chunkPlan(50 * MB)).toEqual({ chunkSize: 50 * MB, count: 1 });
    expect(chunkPlan(105 * MB)).toEqual({ chunkSize: 10 * MB, count: 10 });
  });
});
