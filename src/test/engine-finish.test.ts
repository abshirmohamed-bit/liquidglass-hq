import { describe, expect, it } from "vitest";
import { finishColumns } from "@/lib/engine-events.server";

const words = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ text: `w${i}`, start_ms: i * 500, end_ms: (i + 1) * 500 }));

describe("finishColumns — what the Engine already did, as clip columns", () => {
  it("turns the Engine's words into caption lines at the style's length", () => {
    // bold_white shows four words a line.
    const out = finishColumns({ captions: words(9), caption_style_id: "bold_white" });
    const cues = out["captions"] as { text: string; start_ms: number; end_ms: number }[];
    expect(cues.map((c) => c.text)).toEqual(["w0 w1 w2 w3", "w4 w5 w6 w7", "w8"]);
    expect(cues[0]!.start_ms).toBe(0);
    expect(cues[0]!.end_ms).toBe(2000);
    expect(out["caption_style_id"]).toBe("bold_white");
  });

  it("gives a one-word style one word a line", () => {
    const out = finishColumns({ captions: words(3), caption_style_id: "word_pop" });
    expect((out["captions"] as unknown[]).length).toBe(3);
  });

  it("reads the title whether it arrives flat or nested", () => {
    expect(finishColumns({ title_text: " Hook ", title_style: "headline" })).toMatchObject({
      title_text: "Hook",
      title_style: "headline",
    });
    // A project read nests it; a webhook flattens it. Both must work.
    expect(finishColumns({ title: { text: "Hook", style: "boxed" } })).toMatchObject({
      title_text: "Hook",
      title_style: "boxed",
    });
  });

  it("carries the watermark, aspect, layout and framing", () => {
    const out = finishColumns({
      watermark: { text: "@crayzmundo" }, aspect: "9:16", layout: "full-video",
      framing: { mode: "auto" }, caption_options: { enabled: true },
    });
    expect(out).toMatchObject({
      watermark_text: "@crayzmundo", aspect: "9:16", layout: "full-video",
      framing: { mode: "auto" }, caption_options: { enabled: true },
    });
  });

  it("writes nothing at all when the Engine sent nothing", () => {
    // An empty object here would overwrite good columns with nulls.
    expect(finishColumns(undefined)).toEqual({});
    expect(finishColumns({ captions: [], watermark: {}, title_text: "  " })).toEqual({});
  });

  it("drops malformed words rather than storing them", () => {
    const out = finishColumns({
      captions: [{ text: "ok", start_ms: 0, end_ms: 100 }, { text: "no timings" }, null, { start_ms: 5, end_ms: 9 }],
      caption_style_id: "bold_white",
    });
    expect(out["captions"]).toEqual([{ text: "ok", start_ms: 0, end_ms: 100 }]);
  });
});
