import { describe, expect, it } from "vitest";
import { overlayPatch } from "@/lib/export.server";

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
