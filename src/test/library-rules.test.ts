import { describe, expect, it } from "vitest";
import { validateUpload, kindOf, resolutionBadge, upscaleNote, upscaleFactor, isDirectFileUrl, purgeCutoff } from "@/lib/library-rules";

const GB = 1024 ** 3, MB = 1024 ** 2;
describe("library rules", () => {
  it("allows a video up to 4 GB and rejects larger", () => {
    expect(validateUpload("a.mp4", 4 * GB)).toBeNull();
    expect(validateUpload("a.mp4", 4 * GB + 1)).not.toBeNull();
  });
  it("limits audio 100 MB, images 20 MB, fonts 5 MB, subtitles 2 MB", () => {
    expect(validateUpload("a.mp3", 101 * MB)).not.toBeNull();
    expect(validateUpload("a.png", 21 * MB)).not.toBeNull();
    expect(validateUpload("a.woff2", 6 * MB)).not.toBeNull();
    expect(validateUpload("a.srt", 3 * MB)).not.toBeNull();
    expect(validateUpload("a.ttf", 1 * MB)).toBeNull();
  });
  it("rejects unlisted types", () => { expect(kindOf("a.exe")).toBeNull(); expect(validateUpload("a.exe", 10)).not.toBeNull(); });
  it("badges resolution", () => {
    expect(resolutionBadge(3840, 2160)).toBe("2160p");
    expect(resolutionBadge(1920, 1080)).toBe("1080p");
    expect(resolutionBadge(1280, 720)).toBe("720p");
  });
  it("computes the upscale note factor", () => {
    expect(upscaleFactor(1080)).toBe(1);
    expect(upscaleFactor(720)).toBe(1.5);
    expect(upscaleNote(2160)).toBeNull();
    expect(upscaleNote(720)).toContain("720p landscape source are upscaled about 1.5x");
  });
  it("detects direct file links vs page links", () => {
    expect(isDirectFileUrl("https://x.com/v.mp4")).toBe(true);
    expect(isDirectFileUrl("https://youtube.com/watch?v=1")).toBe(false);
  });
  it("purges trash older than 30 days", () => {
    expect(purgeCutoff(new Date("2026-02-01T00:00:00Z")).toISOString()).toBe("2026-01-02T00:00:00.000Z");
  });
});
