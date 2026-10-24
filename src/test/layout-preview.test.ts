import { describe, expect, it } from "vitest";
import { drawFrame, panAt, resolveLayout } from "@/lib/layout-preview";
import type { Framing } from "@/lib/finish.functions";

/** A canvas context that records what was asked of it. */
function recorder(width = 540, height = 960) {
  const draws: number[][] = [];
  const filters: string[] = [];
  const ctx = {
    canvas: { width, height },
    filter: "none",
    fillStyle: "#000",
    fillRect: () => {},
    clearRect: () => {},
    drawImage: (_v: unknown, ...a: number[]) => { draws.push(a); filters.push(ctx.filter); },
  };
  return { ctx, draws, filters };
}

const video = { videoWidth: 1920, videoHeight: 1080 } as never;

const framing = (over: Partial<Framing> = {}): Framing => ({
  source: { w: 1920, h: 1080 },
  seam: null,
  suggested: "full-video",
  faces: [],
  tracked: { x: 400, y: 0, w: 608, h: 1080, pan: [[0, 100], [1000, 500], [2000, 900]] },
  cells: [],
  ...over,
});

describe("resolveLayout", () => {
  it("asks the Engine what auto meant for this clip", () => {
    expect(resolveLayout("auto", framing({ suggested: "split" }))).toBe("split");
  });
  it("leaves an explicit choice alone", () => {
    expect(resolveLayout("streamer", framing({ suggested: "split" }))).toBe("streamer");
  });
  it("falls back when the analysis has not arrived", () => {
    expect(resolveLayout("auto", null)).toBe("full-video");
  });
});

describe("panAt", () => {
  it("follows the subject over time", () => {
    const f = framing();
    expect(panAt(f, 0)).toBe(100);
    expect(panAt(f, 1100)).toBe(500);
    expect(panAt(f, 5000)).toBe(900);
  });
  it("holds still with nothing to follow", () => {
    expect(panAt(framing({ tracked: { x: 42, y: 0, w: 10, h: 10, pan: [] } }), 0)).toBe(42);
  });
});

describe("drawFrame", () => {
  it("stacks a cell per speaker, each from its own part of the source", () => {
    const { ctx, draws } = recorder();
    const cells = [{ x: 0, y: 100, w: 900, h: 800 }, { x: 1000, y: 120, w: 900, h: 800 }];
    drawFrame(ctx, video, framing({ cells, suggested: "split" }), "split", 0);
    expect(draws).toHaveLength(2);
    expect(draws[0]).toEqual([0, 100, 900, 800, 0, 0, 540, 480]);     // top half
    expect(draws[1]).toEqual([1000, 120, 900, 800, 0, 480, 540, 480]); // bottom half
  });

  it("will not invent a split the Engine did not give cells for", () => {
    const { ctx, draws } = recorder();
    drawFrame(ctx, video, framing({ cells: [] }), "split", 0);
    expect(draws).toHaveLength(1);                 // one crop, not a fake stack
  });

  it("crops to the tracked subject, moving with the clip", () => {
    const { ctx, draws } = recorder();
    drawFrame(ctx, video, framing(), "full-video", 1000);
    expect(draws[0]!.slice(0, 4)).toEqual([500, 0, 608, 1080]);
  });

  it("letterboxes the whole frame for black-box", () => {
    const { ctx, draws } = recorder();
    drawFrame(ctx, video, framing(), "black-box", 0);
    const [, , , , dx, dy, dw, dh] = draws[0]!;
    expect(dw).toBe(540);                          // full width
    expect(dh).toBeCloseTo(303.75, 1);             // 16:9 inside 9:16
    expect(dx).toBe(0);
    expect(dy).toBeCloseTo((960 - 303.75) / 2, 1); // centred
  });

  it("puts a blurred fill behind the clip for streamer", () => {
    const { ctx, draws, filters } = recorder();
    drawFrame(ctx, video, framing(), "streamer", 0);
    expect(draws).toHaveLength(2);
    expect(filters[0]).toContain("blur");          // background
    expect(filters[1]).toBe("none");               // the clip itself, sharp
  });

  it("still draws something before the analysis arrives", () => {
    const { ctx, draws } = recorder();
    drawFrame(ctx, video, null, "auto", 0);
    expect(draws).toHaveLength(1);
  });
});
