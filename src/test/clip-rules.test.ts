import { describe, expect, it } from "vitest";
import {
  MAX_SOURCE_MS, MIN_SOURCE_MS, DONT_CLIP_MAX_MS, clampMoments, coverageLabel, defaultGenreFor,
  editLevelLabel, estimateWaitMinutes, formatClock, jobSummary, lengthLabel, parseClipLength,
  rangeIssue, segmentPlan, sourceDurationIssue, statusPill, suggestedClipCount,
} from "@/lib/clip-rules";

describe("source duration bounds", () => {
  it("rejects a source shorter than 1 minute with the document's message", () => {
    expect(sourceDurationIssue(MIN_SOURCE_MS - 1)).toBe("Source must be a video between 1 minute and 3 hours");
  });
  it("accepts exactly 1 minute and rejects over 3 hours", () => {
    expect(sourceDurationIssue(MIN_SOURCE_MS)).toBeNull();
    expect(sourceDurationIssue(MAX_SOURCE_MS)).toBeNull();
    expect(sourceDurationIssue(MAX_SOURCE_MS + 1)).toBe("Source must be a video between 1 minute and 3 hours");
  });
  it("rejects a source with no recorded length", () => {
    expect(sourceDurationIssue(null)).toContain("no length recorded");
  });
});

describe("range validation", () => {
  it("accepts a clear form and rejects partial or inverted ranges", () => {
    expect(rangeIssue(null, null, 600_000)).toBeNull();
    expect(rangeIssue(1000, null, 600_000)).toContain("both");
    expect(rangeIssue(5000, 1000, 600_000)).toContain("after the start");
    expect(rangeIssue(0, 700_000, 600_000)).toContain("past the end");
    expect(rangeIssue(1000, 60_000, 600_000)).toBeNull();
  });
});

describe("defaults from the source niche", () => {
  it("maps religion to Church, politics to Commentary, entertainment to Comedy", () => {
    expect(defaultGenreFor("religion")).toBe("Church");
    expect(defaultGenreFor("Church sermons")).toBe("Church");
    expect(defaultGenreFor("politics")).toBe("Commentary");
    expect(defaultGenreFor("Political news")).toBe("Commentary");
    expect(defaultGenreFor("entertainment")).toBe("Comedy");
    expect(defaultGenreFor("gaming reactions")).toBe("Comedy");
    expect(defaultGenreFor("podcast")).toBe("Podcast");
    expect(defaultGenreFor("something else")).toBe("Auto");
  });
});

describe("AI-suggested clip count", () => {
  it("is one clip per ~4 minutes, clamped to 2–60", () => {
    expect(suggestedClipCount(8 * 60_000)).toBe(2);
    expect(suggestedClipCount(16 * 60_000)).toBe(4);
    expect(suggestedClipCount(4 * 60 * 60_000)).toBe(60);
    expect(suggestedClipCount(0)).toBe(2);
  });
});

describe("clip length parsing", () => {
  it("reads presets, custom min/max, and rejects bad custom ranges", () => {
    expect(parseClipLength("auto", 0, 0)).toBe("auto");
    expect(parseClipLength("60", 0, 0)).toBe(60);
    expect(parseClipLength("custom", 40, 90)).toEqual({ min_s: 40, max_s: 90 });
    expect(parseClipLength("custom", 90, 40)).toHaveProperty("error");
    expect(parseClipLength("custom", 5, 40)).toHaveProperty("error");
    expect(parseClipLength("custom", 40, 900)).toHaveProperty("error");
  });
  it("labels lengths like the job card copy", () => {
    expect(lengthLabel("auto")).toBe("auto length");
    expect(lengthLabel(90)).toBe("90s clips");
    expect(lengthLabel({ min_s: 40, max_s: 90 })).toBe("40–90s clips");
  });
});

describe("segment plans", () => {
  it("Don't clip makes one clip capped at 15 minutes", () => {
    const plan = segmentPlan(30 * 60_000, "DONT_CLIP", "auto", 5);
    expect(plan).toHaveLength(1);
    expect(plan[0]!.start_ms).toBe(0);
    expect(plan[0]!.end_ms).toBe(DONT_CLIP_MAX_MS);
  });
  it("Whole video covers everything in order with no gaps", () => {
    const plan = segmentPlan(10 * 60_000, "WHOLE_VIDEO", 90, 0);
    expect(plan[0]!.start_ms).toBe(0);
    for (let i = 1; i < plan.length; i++) expect(plan[i]!.start_ms).toBe(plan[i - 1]!.end_ms);
    expect(plan[plan.length - 1]!.end_ms).toBe(10 * 60_000);
    for (const p of plan) expect(p.end_ms - p.start_ms).toBeLessThanOrEqual(90_000);
  });
  it("Best moments returns the requested count, ordered and non-overlapping", () => {
    const plan = segmentPlan(12 * 60_000, "BEST_MOMENTS", 60, 3);
    expect(plan).toHaveLength(3);
    for (let i = 1; i < plan.length; i++) expect(plan[i]!.start_ms).toBeGreaterThanOrEqual(plan[i - 1]!.end_ms);
  });
});

describe("moment clamping", () => {
  it("sorts, clamps to the range and removes overlaps", () => {
    const out = clampMoments([
      { start_ms: 500_000, end_ms: 560_000 },
      { start_ms: 100_000, end_ms: 160_000 },
      { start_ms: 120_000, end_ms: 300_000 },
    ], 600_000);
    expect(out).toHaveLength(2);
    expect(out[0]!.start_ms).toBe(100_000);
    expect(out[0]!.end_ms).toBe(300_000);
    expect(out[1]!.start_ms).toBe(500_000);
  });
});

describe("job summary", () => {
  it("matches the card format", () => {
    expect(jobSummary({ coverage: "WHOLE_VIDEO", clip_length: "auto", edit_level: "full", formats: { layouts: ["streamer"] }, aspect: "9:16" }))
      .toBe("Whole video, auto length, Full, streamer, 9:16");
    expect(jobSummary({ coverage: "DONT_CLIP", clip_length: 60, edit_level: "cuts_only", formats: { layouts: ["split", "two_up"] }, aspect: "1:1" }))
      .toBe("Don't clip, 60s clips, Cuts only, split, 1:1");
    expect(coverageLabel("BEST_MOMENTS")).toBe("Best moments");
    expect(editLevelLabel("cropped")).toBe("Cropped");
  });
});

describe("presentation helpers", () => {
  it("formats clocks and queue estimates", () => {
    expect(formatClock(90_000)).toBe("1:30");
    expect(formatClock(3_661_000)).toBe("1:01:01");
    expect(estimateWaitMinutes(3)).toBe(6);
  });
  it("maps statuses to pills", () => {
    expect(statusPill("QUEUED")).toEqual({ label: "Queued", tone: "gray" });
    expect(statusPill("AWAITING_CONFIRMATION")).toEqual({ label: "Awaiting your count", tone: "orange" });
    expect(statusPill("COMPLETED")).toEqual({ label: "Completed", tone: "green" });
    expect(statusPill("FAILED")).toEqual({ label: "Failed", tone: "red" });
  });
});
