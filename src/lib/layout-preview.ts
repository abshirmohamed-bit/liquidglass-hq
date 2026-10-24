import type { Framing } from "./finish.functions";

/**
 * Drawing the layouts in the browser, from the same numbers the Engine will
 * render with.
 *
 * Format, captions and overlays are instant because they are CSS over a
 * playing video. Layout is not a style — it is a crop, and sometimes two of
 * them — so CSS cannot express it and the editor used to show no change at
 * all until you exported. Here the frame is composited onto a canvas instead,
 * which keeps choosing a layout as quick as choosing a caption colour.
 */

/** What "auto" means for this clip: the Engine already decided from the faces. */
export function resolveLayout(layout: string, framing: Framing | null): string {
  if (layout !== "auto") return layout;
  return framing?.suggested ?? "full-video";
}

/** Where the tracked crop sits at this moment. Pan times are source time. */
export function panAt(framing: Framing, sourceMs: number): number {
  const pan = framing.tracked.pan;
  if (!pan.length) return framing.tracked.x;
  let best = pan[0]!;
  for (const s of pan) {
    if (Math.abs(s[0] - sourceMs) < Math.abs(best[0] - sourceMs)) best = s;
  }
  return best[1];
}

type Ctx = Pick<CanvasRenderingContext2D, "drawImage" | "clearRect" | "fillRect"> & {
  canvas: { width: number; height: number };
  filter: string;
  fillStyle: string | CanvasGradient | CanvasPattern;
};
type Src = CanvasImageSource & { videoWidth?: number; videoHeight?: number };

/** Draw one frame of `video` as `layout` would render it. */
export function drawFrame(ctx: Ctx, video: Src, framing: Framing | null,
                          layout: string, sourceMs: number): void {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const sw = framing?.source.w || video.videoWidth || W;
  const sh = framing?.source.h || video.videoHeight || H;
  ctx.filter = "none";
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  const resolved = resolveLayout(layout, framing);

  // One side of a split-screen source, shown on its own because that is the
  // side doing the talking. Drawn only from a box the Engine gave us.
  if (resolved === "one-feed" && framing?.feed) {
    const f = framing.feed;
    ctx.drawImage(video, f.x, f.y, f.w, f.h, 0, 0, W, H);
    return;
  }

  // Two speakers, a cell each. Only ever drawn from cells the Engine gave us:
  // guessing the cut would show a split that the export does not produce.
  if (resolved === "split" && framing && framing.cells.length >= 2) {
    const rows = framing.cells.length;
    const cellH = H / rows;
    framing.cells.forEach((c, i) => {
      ctx.drawImage(video, c.x, c.y, c.w, c.h, 0, i * cellH, W, cellH);
    });
    return;
  }

  if (resolved === "black-box") {
    const k = Math.min(W / sw, H / sh);
    const w = sw * k, h = sh * k;
    ctx.drawImage(video, 0, 0, sw, sh, (W - w) / 2, (H - h) / 2, w, h);
    return;
  }

  if (resolved === "streamer") {
    const cover = Math.max(W / sw, H / sh);
    ctx.filter = "blur(18px)";
    ctx.drawImage(video, 0, 0, sw, sh, (W - sw * cover) / 2, (H - sh * cover) / 2,
                  sw * cover, sh * cover);
    ctx.filter = "none";
    const h = (sh / sw) * W;
    ctx.drawImage(video, 0, 0, sw, sh, 0, (H - h) / 2, W, h);
    return;
  }

  // full-video and title-subtitles: one crop that follows the subject.
  if (framing) {
    const { w, h, y } = framing.tracked;
    ctx.drawImage(video, panAt(framing, sourceMs), y, w, h, 0, 0, W, H);
    return;
  }
  // No analysis yet — fill the frame, which is what the plain video did.
  const cover = Math.max(W / sw, H / sh);
  ctx.drawImage(video, 0, 0, sw, sh, (W - sw * cover) / 2, (H - sh * cover) / 2,
                sw * cover, sh * cover);
}
