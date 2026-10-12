import { layerIntervals, HIGHLIGHTS, type FinishSpec } from "@/lib/finish-rules";
/**
 * Browser-side media work for the internal crayZmundo engine: ffmpeg.wasm is
 * lazy-loaded only on demand (never during SSR). Files are cached per URL for
 * the session so trimming and exporting the same source download it once.
 */
import { supabase } from "@/integrations/supabase/client";

// ffmpeg.wasm loads from its CDN at runtime so the dev bundler never processes it.
// The ffmpeg.wasm wrapper (v0.12.15) is served from /ffmpeg so its worker is same-origin; the large core loads from the CDN.
const FF_PKG = "/ffmpeg";
const FF_CORE = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm";
type FF = {
  load(o: Record<string, string>): Promise<unknown>;
  writeFile(n: string, d: Uint8Array): Promise<unknown>;
  readFile(n: string): Promise<Uint8Array | string>;
  deleteFile(n: string): Promise<unknown>;
  exec(a: string[]): Promise<number>;
  on(e: string, cb: (x: any) => void): void;
  off(e: string, cb: (x: any) => void): void;
};
const blobUrl = async (url: string, type: string) => URL.createObjectURL(new Blob([await (await fetch(url)).blob()], { type }));
let ffPromise: Promise<FF> | null = null;
const written = new Map<string, string>();

async function ffmpeg(): Promise<FF> {
  if (!ffPromise) ffPromise = (async () => {
    const { FFmpeg } = await import(/* @vite-ignore */ `${location.origin}${FF_PKG}/index.js`);
    const ff: FF = new FFmpeg();
    await ff.load({ classWorkerURL: `${location.origin}${FF_PKG}/worker.js`, coreURL: await blobUrl(`${FF_CORE}/ffmpeg-core.js`, "text/javascript"), wasmURL: await blobUrl(`${FF_CORE}/ffmpeg-core.wasm`, "application/wasm") });
    return ff;
  })();
  try { return await ffPromise; } catch (e) { ffPromise = null; throw e; }
}

async function input(ff: FF, url: string, onStatus?: (s: string) => void): Promise<string> {
  const have = written.get(url);
  if (have) return have;
  onStatus?.("Downloading source…");
  const res = await fetch(url);
  if (!res.ok) throw new Error("Could not download the source video.");
  const buf = new Uint8Array(await res.arrayBuffer());
  const name = `src${written.size}.mp4`;
  await ff.writeFile(name, buf);
  written.set(url, name);
  return name;
}

/** The caption font (Montserrat ExtraBold), shared by the editor preview and the burned-in export. */
export const FONT_URL = "https://cdn.jsdelivr.net/fontsource/fonts/montserrat@latest/latin-800-normal.ttf";
let fontBytes: Promise<Uint8Array> | null = null;
export function captionFont(): Promise<Uint8Array> {
  if (!fontBytes) fontBytes = fetch(FONT_URL).then(async (r) => { if (!r.ok) throw new Error("Could not load the caption font."); return new Uint8Array(await r.arrayBuffer()); });
  return fontBytes;
}
let fontsReady = false;
async function fonts(ff: FF) {
  if (fontsReady) return;
  await (ff as FF & { createDir(p: string): Promise<unknown> }).createDir("/fonts").catch(() => {});
  await ff.writeFile("/fonts/Montserrat-ExtraBold.ttf", await captionFont());
  fontsReady = true;
}

/** Cuts the clip's audio into short mp3 chunks for transcription (each ~chunkMs long). */
export async function audioChunks(url: string, startMs: number, endMs: number, chunkMs: number, onStatus?: (s: string) => void): Promise<{ start_ms: number; end_ms: number; data: Uint8Array }[]> {
  const ff = await ffmpeg();
  const src = await input(ff, url, onStatus);
  const out: { start_ms: number; end_ms: number; data: Uint8Array }[] = [];
  for (let s = startMs; s < endMs; s += chunkMs) {
    const e = Math.min(endMs, s + chunkMs);
    onStatus?.(`Preparing audio ${Math.round(((s - startMs) / Math.max(1, endMs - startMs)) * 100)}%`);
    if (await ff.exec(["-ss", (s / 1000).toFixed(3), "-i", src, "-t", ((e - s) / 1000).toFixed(3), "-vn", "-ac", "1", "-ar", "16000", "-c:a", "libmp3lame", "-b:a", "48k", "chunk.mp3"]) !== 0) throw new Error("Could not read the audio.");
    out.push({ start_ms: s, end_ms: e, data: (await ff.readFile("chunk.mp3")) as Uint8Array });
    await ff.deleteFile("chunk.mp3").catch(() => {});
  }
  return out;
}

const secs = (ms: number) => (ms / 1000).toFixed(3);

/** Peaks (0..1) for the waveform strip between start and end. */
export async function waveform(url: string, startMs: number, endMs: number, bars = 160, onStatus?: (s: string) => void): Promise<number[]> {
  const ff = await ffmpeg();
  const src = await input(ff, url, onStatus);
  onStatus?.("Reading audio…");
  await ff.exec(["-ss", secs(startMs), "-i", src, "-t", secs(endMs - startMs), "-vn", "-ac", "1", "-ar", "4000", "-f", "s16le", "wave.raw"]);
  const raw = (await ff.readFile("wave.raw")) as Uint8Array;
  await ff.deleteFile("wave.raw").catch(() => {});
  const pcm = new Int16Array(raw.buffer, raw.byteOffset, Math.floor(raw.byteLength / 2));
  const per = Math.max(1, Math.floor(pcm.length / bars));
  const out: number[] = [];
  for (let b = 0; b < bars; b++) { let m = 0; for (let i = b * per; i < Math.min(pcm.length, (b + 1) * per); i++) m = Math.max(m, Math.abs(pcm[i]!)); out.push(m / 32768); }
  return out;
}

function probe(blob: Blob): Promise<{ w: number; h: number; sec: number }> {
  return new Promise((resolve) => {
    const v = document.createElement("video"); v.preload = "metadata"; v.muted = true;
    const u = URL.createObjectURL(blob);
    v.onloadedmetadata = () => { resolve({ w: v.videoWidth, h: v.videoHeight, sec: v.duration }); URL.revokeObjectURL(u); };
    v.onerror = () => { resolve({ w: 0, h: 0, sec: 0 }); URL.revokeObjectURL(u); };
    v.src = u;
  });
}

export type RenderJob = { clipId: string; exportId: string; aspect: string | null; sourceUrl: string | null; segments: { start_ms: number; end_ms: number }[]; w: number; h: number; finish?: FinishSpec | null };
export type RenderResult = { path: string; thumbPath: string | null; width: number; height: number; size: number; lengthSec: number };

/** Cuts the segments, crops/scales to the export size, joins them, uploads to storage. */
export async function renderClip(workspace: string, job: RenderJob, onStatus: (s: string) => void): Promise<RenderResult> {
  if (!job.sourceUrl) throw new Error("The source video isn't available.");
  const ff = await ffmpeg();
  const src = await input(ff, job.sourceUrl, onStatus);
  const onProg = ({ progress }: { progress: number }) => onStatus(`Rendering ${Math.max(0, Math.min(100, Math.round(progress * 100)))}%`);
  ff.on("progress", onProg);
  try {
    const parts: string[] = [];
    const vf = `scale=${job.w}:${job.h}:force_original_aspect_ratio=increase,crop=${job.w}:${job.h},setsar=1`;
    for (const [i, s] of job.segments.entries()) {
      const out = `part${i}.mp4`;
      const code = await ff.exec(["-ss", secs(s.start_ms), "-i", src, "-t", secs(s.end_ms - s.start_ms), "-vf", vf, "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2", "-movflags", "+faststart", out]);
      if (code !== 0) throw new Error("The render failed.");
      parts.push(out);
    }
    let final = parts[0]!;
    if (parts.length > 1) {
      await ff.writeFile("list.txt", new TextEncoder().encode(parts.map((p) => `file '${p}'`).join("\n")));
      if (await ff.exec(["-f", "concat", "-safe", "0", "-i", "list.txt", "-c", "copy", "-movflags", "+faststart", "merged.mp4"]) !== 0) throw new Error("Could not join the clips.");
      final = "merged.mp4";
    }
    if (job.finish) {
      onStatus("Burning in captions…");
      const list = await drawLayer(ff, job.finish, job.w, job.h);
      if (await ff.exec(["-i", final, "-f", "concat", "-safe", "0", "-i", "layer.txt", "-filter_complex", "[1:v]format=rgba[o];[0:v][o]overlay=0:0:eof_action=pass", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23", "-pix_fmt", "yuv420p", "-c:a", "copy", "-movflags", "+faststart", "styled.mp4"]) !== 0) throw new Error("Could not burn in the captions.");
      for (const f of list) await ff.deleteFile(f).catch(() => {});
      parts.push(final); final = "styled.mp4";
    }
    await ff.exec(["-ss", "0.5", "-i", final, "-frames:v", "1", "-vf", "scale=360:-2", "thumb.jpg"]);
    const video = (await ff.readFile(final)) as Uint8Array;
    let thumb: Uint8Array | null = null; try { thumb = (await ff.readFile("thumb.jpg")) as Uint8Array; } catch { thumb = null; }
    for (const f of [...parts, "merged.mp4", "styled.mp4", "layer.txt", "list.txt", "thumb.jpg"]) await ff.deleteFile(f).catch(() => {});
    const blob = new Blob([video.slice().buffer], { type: "video/mp4" });
    const meta = await probe(blob);
    onStatus("Uploading…");
    const path = `${workspace}/exports/${job.clipId}-${job.exportId}.mp4`;
    const up = await supabase.storage.from("media").upload(path, blob, { contentType: "video/mp4", upsert: true });
    if (up.error) throw new Error(up.error.message);
    let thumbPath: string | null = null;
    if (thumb) { const tp = `${workspace}/exports/${job.clipId}-${job.exportId}.jpg`; const t = await supabase.storage.from("media").upload(tp, new Blob([thumb.slice().buffer], { type: "image/jpeg" }), { contentType: "image/jpeg", upsert: true }); if (!t.error) thumbPath = tp; }
    return { path, thumbPath, width: meta.w || job.w, height: meta.h || job.h, size: blob.size, lengthSec: meta.sec || job.segments.reduce((n, s) => n + (s.end_ms - s.start_ms), 0) / 1000 };
  } finally { ff.off("progress", onProg); }
}

/** Reads duration/size and a thumbnail from a local video file before upload. */
export function inspectVideo(file: File): Promise<{ durationMs: number; width: number; height: number; thumb: Blob | null }> {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video"); v.preload = "auto"; v.muted = true; v.playsInline = true;
    const u = URL.createObjectURL(file);
    v.onloadedmetadata = () => { v.currentTime = Math.min(1, v.duration / 2); };
    v.onseeked = () => {
      const c = document.createElement("canvas"); const scale = 360 / Math.max(1, v.videoWidth);
      c.width = 360; c.height = Math.round(v.videoHeight * scale);
      c.getContext("2d")?.drawImage(v, 0, 0, c.width, c.height);
      c.toBlob((b) => { resolve({ durationMs: Math.round(v.duration * 1000), width: v.videoWidth, height: v.videoHeight, thumb: b }); URL.revokeObjectURL(u); }, "image/jpeg", 0.8);
    };
    v.onerror = () => { URL.revokeObjectURL(u); reject(new Error("This video can't be read in the browser.")); };
    v.src = u;
  });
}

let canvasFont: Promise<void> | null = null;
function loadCanvasFont() {
  canvasFont ??= (async () => { const f = new FontFace("CzCaption", `url(${FONT_URL})`, { weight: "800" }); await f.load(); document.fonts.add(f); })();
  return canvasFont;
}
function wrap(ctx: CanvasRenderingContext2D, words: string[], max: number): string[][] {
  const lines: string[][] = [[]];
  for (const w of words) { const cur = lines[lines.length - 1]!; if (cur.length && ctx.measureText([...cur, w].join(" ")).width > max) lines.push([w]); else cur.push(w); }
  return lines;
}
/** Draws one transparent frame per constant interval (same look as the editor preview) and writes the timed concat list. */
async function drawLayer(ff: FF, spec: FinishSpec, w: number, h: number): Promise<string[]> {
  await loadCanvasFont();
  const k = w / 1080, cv = document.createElement("canvas"); cv.width = w; cv.height = h;
  const ctx = cv.getContext("2d")!, files: string[] = [], lines: string[] = [];
  const st = spec.style, size = st.size * k;
  const drawWords = (words: { t: string; color: string }[], cx: number, cy: number, fs: number, opts: { outline: string; ow: number; shadow: boolean; box: string | null; maxW: number }) => {
    ctx.font = `800 ${fs}px CzCaption`; ctx.textBaseline = "middle"; ctx.lineJoin = "round";
    const rows = wrap(ctx, words.map((x) => x.t), opts.maxW); let i = 0; const lh = fs * 1.2, top = cy - ((rows.length - 1) * lh) / 2;
    rows.forEach((row, r) => {
      const y = top + r * lh, full = ctx.measureText(row.join(" ")).width; let x = cx - full / 2;
      if (opts.box) { ctx.fillStyle = opts.box; const p = 14 * k; ctx.beginPath(); ctx.roundRect(x - p, y - lh / 2, full + 2 * p, lh, 10 * k); ctx.fill(); }
      for (const t of row) {
        const wd = words[i++]!; ctx.shadowColor = opts.shadow ? "rgba(0,0,0,.6)" : "transparent"; ctx.shadowBlur = opts.shadow ? 6 * k : 0; ctx.shadowOffsetY = opts.shadow ? 3 * k : 0;
        if (opts.ow > 0) { ctx.strokeStyle = opts.outline; ctx.lineWidth = opts.ow * 2; ctx.strokeText(t, x, y); }
        ctx.shadowColor = "transparent"; ctx.fillStyle = wd.color; ctx.fillText(t, x, y); x += ctx.measureText(t + " ").width;
      }
    });
    return top + rows.length * lh;
  };
  const hex = (c: string, a: number) => { const n = parseInt(c.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
  const ivs = layerIntervals(spec);
  for (let n = 0; n < ivs.length; n++) {
    const iv = ivs[n]!; ctx.clearRect(0, 0, w, h);
    let capBottom = (st.y / 100) * h + size;
    if (iv.cue) {
      const raw = iv.cue.text.split(/\s+/).filter(Boolean).map((t) => (st.uppercase ? t.toUpperCase() : t));
      const shown = st.animation === "typewriter" ? raw.slice(0, iv.word + 1) : raw;
      capBottom = drawWords(shown.map((t, j) => ({ t, color: st.active && j === iv.word && st.animation !== "typewriter" ? st.active : st.fill })), (st.x / 100) * w, (st.y / 100) * h, size,
        { outline: st.outline, ow: st.box ? 0 : st.outlineW * k, shadow: st.shadow && !st.box, box: st.box ? hex(st.boxColor, st.boxOpacity) : null, maxW: w * 0.84 });
    }
    if (spec.title) {
      const t = spec.title, up = t.style === "headline" || t.style === "bold_band", hw = (t.highlight_word ?? "").toLowerCase().replace(/[^\w']/g, "");
      drawWords(t.text.trim().split(/\s+/).map((x) => (up ? x.toUpperCase() : x)).map((x) => ({ t: x, color: t.style === "headline" && hw && x.toLowerCase().replace(/[^\w']/g, "") === hw ? HIGHLIGHTS[t.highlight ?? "yellow"] : "#FFFFFF" })), w / 2, (t.y / 100) * h, 66 * k,
        { outline: "#000000", ow: t.style === "minimal" ? 2 * k : 5 * k, shadow: true, box: t.style === "boxed" || t.style === "bold_band" ? "rgba(0,0,0,.55)" : null, maxW: w * 0.88 });
    }
    if (spec.watermark) {
      const m = spec.watermark, mg = 40 * k; ctx.globalAlpha = m.opacity;
      const x = m.pos.endsWith("left") ? mg + 120 * k : m.pos.endsWith("right") ? w - mg - 120 * k : w / 2;
      const y = m.pos.startsWith("top") ? mg + 30 * k : m.pos.startsWith("bottom") ? h - mg - 30 * k : Math.min(h - mg, capBottom + 20 * k);
      drawWords([{ t: m.text, color: "#FFFFFF" }], x, y, 34 * k, { outline: "rgba(0,0,0,.5)", ow: 2 * k, shadow: false, box: null, maxW: w });
      ctx.globalAlpha = 1;
    }
    const blob: Blob = await new Promise((r) => cv.toBlob((b) => r(b!), "image/png"));
    const f = `L${n}.png`; await ff.writeFile(f, new Uint8Array(await blob.arrayBuffer())); files.push(f);
    lines.push(`file '${f}'`, `duration ${((iv.end_ms - iv.start_ms) / 1000).toFixed(3)}`);
  }
  if (files.length) lines.push(`file '${files[files.length - 1]}'`);
  await ff.writeFile("layer.txt", new TextEncoder().encode(lines.join("\n")));
  return files;
}
