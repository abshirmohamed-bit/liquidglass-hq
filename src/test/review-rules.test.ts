import { describe, expect, it } from "vitest";
import { exportSize, makeShareToken, shareTokenValid, trimIssue, parsePrecise, formatPrecise, needsReexport, mergeIssue, fromLabel, filterClips, defaultJob } from "@/lib/review-rules";

const found = { start_ms: 100_000, end_ms: 130_000 };
describe("review rules (Prompt 4)", () => {
  it("allows extending up to 60 s each way, not more", () => {
    expect(trimIssue(40_000, 190_000, found, 600_000)).toBeNull();
    expect(trimIssue(39_999, 130_000, found, 600_000)).toMatch(/60 seconds/);
    expect(trimIssue(100_000, 190_001, found, 600_000)).toMatch(/60 seconds/);
    expect(trimIssue(102_000, 135_000, found, 600_000)).toBeNull(); // trim 2 s, extend 5 s
  });
  it("exports HD at 1080x1920 and 4K at 2160x3840", () => {
    expect(exportSize("HD", "9:16")).toEqual({ w: 1080, h: 1920 });
    expect(exportSize("UHD", "9:16")).toEqual({ w: 2160, h: 3840 });
  });
  it("share links last 7 days", () => {
    const now = Date.UTC(2026, 0, 1);
    const t = makeShareToken("abcdefghijklmnopqr", now);
    expect(shareTokenValid(t, now + 6.9 * 86400_000)).toBe(true);
    expect(shareTokenValid(t, now + 7.01 * 86400_000)).toBe(false);
  });
  it("parses mm:ss.ms and labels 'From 20:06'", () => {
    expect(parsePrecise("01:05.250")).toBe(65_250);
    expect(formatPrecise(65_250)).toBe("01:05.250");
    expect(fromLabel(1_206_000)).toBe("20:06");
  });
  it("shows Re-export only when a READY clip's in/out changed", () => {
    expect(needsReexport({ status: "READY", start_ms: 1, end_ms: 2, edits: { exported: { start_ms: 1, end_ms: 2 } } })).toBe(false);
    expect(needsReexport({ status: "READY", start_ms: 1, end_ms: 3, edits: { exported: { start_ms: 1, end_ms: 2 } } })).toBe(true);
  });
  it("merges only 2+ clips from the same source", () => {
    expect(mergeIssue([{ source_asset_id: "a" }])).toMatch(/two or more/);
    expect(mergeIssue([{ source_asset_id: "a" }, { source_asset_id: "b" }])).toMatch(/same source/);
    expect(mergeIssue([{ source_asset_id: "a" }, { source_asset_id: "a" }])).toBeNull();
  });
  it("sorts by score by default and defaults to the latest completed job", () => {
    const base = { title: "x", status: "FOUND", start_ms: 0, end_ms: 1000, duration_ms: 1000, favorite: false, disliked: false, edits: null, dub_language: null, job_id: "j", source_asset_id: "s", assignee: null };
    const out = filterClips([{ ...base, id: "a", score: 5 }, { ...base, id: "b", score: 9 }], {});
    expect(out[0]?.id).toBe("b");
    expect(defaultJob([{ id: "1", status: "COMPLETED", created_at: "2026-01-01" }, { id: "2", status: "COMPLETED", created_at: "2026-02-01" }, { id: "3", status: "FAILED", created_at: "2026-03-01" }])).toBe("2");
  });
});
