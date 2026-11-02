import { describe, expect, it } from "vitest";
import { overlayPatch, patchFor } from "@/lib/export.server";

const base = { title_text: null, title_style: null, watermark_text: null, overlays: null, caption_options: null };

describe("export overlays", () => {
  it("sends the editor's watermark position and opacity", () => {
    const p = overlayPatch({ ...base, watermark_text: "@me", overlays: { watermark: { pos: "top-left", opacity: 0.3 } } });
    expect(p.watermark).toEqual({ text: "@me", position: "top-left", opacity: 0.3 });
  });
  it("clears a removed title and handle", () => {
    const p = overlayPatch(base);
    expect(p.title).toEqual({});
    expect(p.watermark).toEqual({});
  });
  it("passes captions off", () => {
    expect(overlayPatch({ ...base, caption_options: { enabled: false } }).caption_options).toEqual({ enabled: false });
  });
});

const clip = { ...base, id: "clip", start_ms: 120000, end_ms: 125000, aspect: "9:16", layout: "full-video", caption_style_id: "bold_white", caption_style: {}, captions: [{ start_ms: 0, end_ms: 2000, text: "Edited words" }], engine_project_id: "project", edits: {} };
describe("complete Engine finish layer", () => {
  it("sends edited words in clip time", () => {
    expect(patchFor(clip)["captions"]).toEqual([{ start_ms: 0, end_ms: 1000, text: "Edited" }, { start_ms: 1000, end_ms: 2000, text: "words" }]);
  });
  it("sends an empty caption list to clear old words", () => {
    expect(patchFor({ ...clip, captions: [] })["captions"]).toEqual([]);
  });
  it("renders custom caption placement and size", () => {
    const p = patchFor({ ...clip, caption_style: { x: 30, y: 18, size: 80 } });
    const options = p["caption_options"] as { finish_ass: Record<string, string> };
    expect(options.finish_ass["1080p"]).toContain("\\pos(324,346)");
    expect(options.finish_ass["1080p"]).toContain("Style: Cap,Montserrat,80,");
    expect(options.finish_ass["2160p"]).toContain("\\pos(648,691)");
  });
  it("renders title position and highlighted word", () => {
    const p = patchFor({ ...clip, title_text: "Real title", title_style: "headline", overlays: { title: { y: 40, highlight_word: "Real", highlight: "red" } } });
    const ass = (p["caption_options"] as { finish_ass: Record<string, string> }).finish_ass["1080p"];
    expect(ass).toContain("\\pos(540,768)");
    expect(ass).toContain("{\\c&H003A45FF}REAL");
  });
});
