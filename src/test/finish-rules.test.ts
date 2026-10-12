import { describe, expect, it } from "vitest";
import { CAPTION_PRESETS, styleFor, wordsFromChunks, cuesFromWords, toOutput, toAss, assForClip, copyIssue, postColumn } from "@/lib/finish-rules";

describe("finish rules", () => {
  it("ships the 20 named caption presets", () => {
    expect(CAPTION_PRESETS).toHaveLength(20);
    expect(CAPTION_PRESETS.map((p) => p.name)).toContain("Karaoke highlight");
  });
  it("custom style overrides the preset, including dragged position", () => {
    const s = styleFor("yellow_pop", { x: 30, y: 40 });
    expect([s.fill, s.x, s.y]).toEqual(["#FFE600", 30, 40]);
  });
  it("spreads chunk words evenly and groups by max words", () => {
    const w = wordsFromChunks([{ start_ms: 0, end_ms: 4000, text: "one two three four" }]);
    expect(w[1]).toEqual({ start_ms: 1000, end_ms: 2000, text: "two" });
    expect(cuesFromWords(w, 3).map((c) => c.text)).toEqual(["one two three", "four"]);
  });
  it("maps source time to output time across segments", () => {
    const segs = [{ start_ms: 1000, end_ms: 2000 }, { start_ms: 5000, end_ms: 6000 }];
    expect(toOutput(5500, segs)).toBe(1500);
    expect(toOutput(3000, segs)).toBeNull();
  });
  it("burns captions at the dragged position and highlights the headline word", () => {
    const ass = toAss({ w: 1080, h: 1920, durationMs: 3000, segments: [{ start_ms: 10_000, end_ms: 13_000 }], cues: [{ start_ms: 10_000, end_ms: 11_000, text: "hello there" }], style: styleFor("bold_white", { x: 50, y: 25 }), captionsOn: true,
      title: { text: "Big news today", style: "headline", y: 14, highlight_word: "news", highlight: "red" }, watermark: { text: "@crayz", pos: "top-right", opacity: 0.5 } });
    expect(ass).toContain("\\pos(540,480)}hello there");
    expect(ass).toContain("0:00:00.00,0:00:01.00,Cap");
    expect(ass).toContain("{\\c&H003A45FF}NEWS");
    expect(ass).toContain("@crayz");
  });
  it("skips burn-in when there is nothing to draw", () => {
    expect(assForClip({ caption_style_id: null, caption_style: null, captions: [], caption_options: null, title_text: "", title_style: null, overlays: null, watermark_text: "" }, 1080, 1920, [{ start_ms: 0, end_ms: 1000 }])).toBeNull();
  });
  it("blocks copy over the platform limit (X 280)", () => {
    expect(copyIssue("X", "a".repeat(281))).toMatch(/280/);
    expect(copyIssue("X", "a".repeat(280))).toBeNull();
  });
  it("manual posts past their slot are due now; future ones stay scheduled", () => {
    const now = Date.parse("2026-10-13T10:00:00Z");
    expect(postColumn({ status: "QUEUED", mode: "MANUAL", scheduled_at: "2026-10-13T09:59:00Z" }, now)).toBe("Due now");
    expect(postColumn({ status: "QUEUED", mode: "MANUAL", scheduled_at: "2026-10-13T11:00:00Z" }, now)).toBe("Scheduled");
  });
});
