import { describe, expect, it } from "vitest";
import { toClipTime } from "@/components/agency/editor";

const cues = (...starts: number[]) =>
  starts.map((s) => ({ start_ms: s, end_ms: s + 1000, text: "w" }));

describe("toClipTime — one base for cue times", () => {
  it("leaves the Engine's clip-time cues alone", () => {
    const out = toClipTime(cues(0, 2000, 4000), 600_000);
    expect(out.map((c) => c.start_ms)).toEqual([0, 2000, 4000]);
  });

  it("rebases source-time cues from the browser transcriber", () => {
    // A clip 10 minutes in, transcribed in the browser, arrives in source time.
    const out = toClipTime(cues(600_000, 602_000), 600_000);
    expect(out.map((c) => c.start_ms)).toEqual([0, 2000]);
    expect(out[0]!.end_ms).toBe(1000);
  });

  it("does nothing for a clip that starts at the very beginning", () => {
    expect(toClipTime(cues(0, 1000), 0).map((c) => c.start_ms)).toEqual([0, 1000]);
  });

  it("survives an empty transcript", () => {
    expect(toClipTime([], 600_000)).toEqual([]);
  });
});
