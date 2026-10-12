/** Review rules from Build Pack Prompt 4: filters, trim limits, export sizes, share links, timelines. */
export const CLIP_STATUSES = ["FOUND", "APPROVED", "REJECTED", "EXPORTING", "READY", "FAILED"] as const;
export type ClipStatus = (typeof CLIP_STATUSES)[number];
export const MAX_EXTEND_MS = 60_000;
export const SHARE_DAYS = 7;
export const EXPORT_STALE_MS = 2 * 60_000;
export const EXPORT_SIZES = { HD: { w: 1080, h: 1920, engine: "1080p" }, UHD: { w: 2160, h: 3840, engine: "2160p" } } as const;
export type Resolution = keyof typeof EXPORT_SIZES;
export const STORAGE_PREFIX = "storage://media/";

/** Dimensions for an export at a given aspect; the long edge follows HD/4K. */
export function exportSize(res: Resolution, aspect: string | null | undefined): { w: number; h: number } {
  const long = EXPORT_SIZES[res].h, short = EXPORT_SIZES[res].w;
  switch (aspect) {
    case "16:9": return { w: long, h: short };
    case "1:1": return { w: short, h: short };
    case "4:5": return { w: short, h: Math.round((short * 5) / 4 / 2) * 2 };
    default: return { w: short, h: long };
  }
}

/** "20:06" style clock from ms; hours shown when needed. */
export function fromLabel(ms: number | null | undefined): string {
  const s = Math.max(0, Math.floor((ms ?? 0) / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

/** mm:ss.ms text field formatting / parsing for the Trim modal. */
export function formatPrecise(ms: number): string {
  const t = Math.max(0, Math.round(ms));
  const m = Math.floor(t / 60000), s = Math.floor((t % 60000) / 1000), r = t % 1000;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(r).padStart(3, "0")}`;
}
export function parsePrecise(text: string): number | null {
  const m = /^\s*(\d+):([0-5]?\d)(?:\.(\d{1,3}))?\s*$/.exec(text);
  if (!m) return null;
  return Number(m[1]) * 60000 + Number(m[2]) * 1000 + Number((m[3] ?? "0").padEnd(3, "0"));
}

/** Trim/extend: may move up to 60 s beyond the found in/out points, within the source. */
export function trimIssue(start: number, end: number, found: { start_ms: number; end_ms: number }, sourceMs: number | null | undefined): string | null {
  if (!(end > start)) return "The end must be after the start.";
  if (start < 0) return "The start can't be before the beginning of the video.";
  if (sourceMs != null && end > sourceMs) return "The end can't be past the end of the video.";
  if (start < found.start_ms - MAX_EXTEND_MS) return "You can extend the start by at most 60 seconds.";
  if (end > found.end_ms + MAX_EXTEND_MS) return "You can extend the end by at most 60 seconds.";
  return null;
}

export type Word = { start_ms: number; end_ms: number; text: string };
/** Normalises a stored transcript into words (accepts {words:[...]} or an array, ms or seconds). */
export function transcriptWords(t: unknown): Word[] {
  const arr = Array.isArray(t) ? t : (t && typeof t === "object" && Array.isArray((t as { words?: unknown }).words) ? (t as { words: unknown[] }).words : []);
  return arr.flatMap((w) => {
    const o = (w ?? {}) as Record<string, unknown>;
    const text = String(o["text"] ?? o["word"] ?? "");
    const s = typeof o["start_ms"] === "number" ? o["start_ms"] : typeof o["start"] === "number" ? o["start"] * 1000 : null;
    const e = typeof o["end_ms"] === "number" ? o["end_ms"] : typeof o["end"] === "number" ? o["end"] * 1000 : null;
    return text && s != null && e != null ? [{ start_ms: s, end_ms: e, text }] : [];
  });
}
export const sliceWords = (words: Word[], start: number, end: number) => words.filter((w) => w.end_ms > start && w.start_ms < end);

/** Snap to sentence: start moves back to a sentence start, end forward to a sentence end. */
export function snapToSentence(words: Word[], start: number, end: number): { start: number; end: number } {
  if (!words.length) return { start, end };
  const ends = (w: Word) => /[.!?]["')\]]?$/.test(w.text);
  let s = start, e = end;
  const i = words.findIndex((w) => w.end_ms > start);
  if (i >= 0) { let k = i; while (k > 0 && !ends(words[k - 1]!)) k--; s = words[k]!.start_ms; }
  const j = words.findIndex((w) => w.end_ms >= end);
  if (j >= 0) { let k = j; while (k < words.length - 1 && !ends(words[k]!)) k++; e = words[k]!.end_ms; }
  return { start: s, end: e };
}

export type ReviewClip = {
  id: string; title: string | null; status: string; score: number | null; start_ms: number | null; end_ms: number | null;
  duration_ms: number | null; favorite: boolean; disliked: boolean; edits: unknown; dub_language: string | null;
  job_id: string | null; source_asset_id: string | null; assignee: string | null; transcriptText?: string;
};
export type ReviewFilter = {
  job?: string | undefined; status?: string | undefined; source?: string | undefined; mine?: boolean | undefined; me?: string | undefined;
  flags?: string[] | undefined; q?: string | undefined; sort?: "score" | "time" | undefined;
};
export const FLAG_FILTERS = ["Favorited", "Disliked", "Edited", "Dubbed", "Not dubbed", "Under 60 s", "Under 180 s"] as const;

export const isEdited = (c: Pick<ReviewClip, "edits">) => !!c.edits && typeof c.edits === "object" && !!(c.edits as { trimmed?: boolean }).trimmed;
export const clipLength = (c: Pick<ReviewClip, "duration_ms" | "start_ms" | "end_ms">) => c.duration_ms ?? ((c.end_ms ?? 0) - (c.start_ms ?? 0));

export function filterClips<T extends ReviewClip>(clips: T[], f: ReviewFilter): T[] {
  const q = f.q?.trim().toLowerCase();
  const out = clips.filter((c) => {
    if (f.job && c.job_id !== f.job) return false;
    if (f.status && c.status !== f.status) return false;
    if (f.source && c.source_asset_id !== f.source) return false;
    if (f.mine && c.assignee !== f.me) return false;
    for (const flag of f.flags ?? []) {
      if (flag === "Favorited" && !c.favorite) return false;
      if (flag === "Disliked" && !c.disliked) return false;
      if (flag === "Edited" && !isEdited(c)) return false;
      if (flag === "Dubbed" && !c.dub_language) return false;
      if (flag === "Not dubbed" && c.dub_language) return false;
      if (flag === "Under 60 s" && !(clipLength(c) < 60_000)) return false;
      if (flag === "Under 180 s" && !(clipLength(c) < 180_000)) return false;
    }
    if (q && !`${c.title ?? ""} ${c.transcriptText ?? ""}`.toLowerCase().includes(q)) return false;
    return true;
  });
  return out.sort((a, b) => (f.sort === "time" ? (a.start_ms ?? 0) - (b.start_ms ?? 0) : (b.score ?? 0) - (a.score ?? 0)));
}

/** Default job filter: the most recent completed job. */
export function defaultJob(jobs: { id: string; status: string; created_at: string }[]): string | undefined {
  return [...jobs].filter((j) => j.status === "COMPLETED").sort((a, b) => b.created_at.localeCompare(a.created_at))[0]?.id;
}

/** Share tokens embed their expiry: <random>.<unix seconds>. */
export function makeShareToken(random: string, now = Date.now()): string {
  return `${random}.${Math.floor(now / 1000) + SHARE_DAYS * 86400}`;
}
export function shareTokenValid(token: string, now = Date.now()): boolean {
  const m = /^[A-Za-z0-9_-]{16,}\.(\d+)$/.exec(token);
  return !!m && Number(m[1]) * 1000 > now;
}

/** A READY clip whose in/out changed since its export shows "Re-export". */
export function needsReexport(c: { status: string; start_ms: number | null; end_ms: number | null; edits: unknown }): boolean {
  if (c.status !== "READY") return false;
  const ex = (c.edits as { exported?: { start_ms: number; end_ms: number } } | null)?.exported;
  return !!ex && (ex.start_ms !== c.start_ms || ex.end_ms !== c.end_ms);
}

/** Merge: two or more clips from one source, joined in time order. */
export function mergeIssue(clips: { source_asset_id: string | null }[]): string | null {
  if (clips.length < 2) return "Select two or more clips to merge.";
  if (new Set(clips.map((c) => c.source_asset_id)).size !== 1) return "Only clips from the same source can be merged.";
  return null;
}
export function mergeSegments<T extends { start_ms: number | null; end_ms: number | null }>(clips: T[]) {
  return [...clips].sort((a, b) => (a.start_ms ?? 0) - (b.start_ms ?? 0)).map((c) => ({ start_ms: c.start_ms ?? 0, end_ms: c.end_ms ?? 0 }));
}

/** .srt for a clip's transcript slice, times relative to the clip start. */
export function srtFor(words: Word[], start: number, end: number): string {
  const ws = sliceWords(words, start, end);
  const lines: { s: number; e: number; t: string }[] = [];
  for (let i = 0; i < ws.length; i += 7) {
    const g = ws.slice(i, i + 7);
    lines.push({ s: Math.max(0, g[0]!.start_ms - start), e: Math.min(end, g[g.length - 1]!.end_ms) - start, t: g.map((w) => w.text).join(" ") });
  }
  const ts = (ms: number) => formatPrecise(ms).replace(".", ",").replace(/^(\d+):/, (_, m) => `${String(Math.floor(Number(m) / 60)).padStart(2, "0")}:${String(Number(m) % 60).padStart(2, "0")}:`);
  return lines.map((l, i) => `${i + 1}\n${ts(l.s)} --> ${ts(l.e)}\n${l.t}\n`).join("\n");
}

/** Timeline exports that open in Final Cut Pro, Premiere Pro or DaVinci Resolve. */
export type TimelineFormat = "fcpxml" | "premiere" | "edl";
export function timelineFile(fmt: TimelineFormat, t: { title: string; sourceName: string; sourceUrl: string; fps: number; start_ms: number; end_ms: number; sourceMs: number }): { name: string; body: string } {
  const fps = Math.round(t.fps || 30);
  const fr = (ms: number) => Math.round((ms / 1000) * fps);
  const dur = t.end_ms - t.start_ms;
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  const safe = t.title.replace(/[^\w -]+/g, "").trim() || "clip";
  if (fmt === "fcpxml") {
    const r = (ms: number) => `${fr(ms)}/${fps}s`;
    return { name: `${safe}.fcpxml`, body: `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.9">
  <resources>
    <format id="r1" frameDuration="1/${fps}s"/>
    <asset id="r2" name="${esc(t.sourceName)}" start="0s" duration="${r(t.sourceMs)}" hasVideo="1" hasAudio="1" format="r1"><media-rep kind="original-media" src="${esc(t.sourceUrl)}"/></asset>
  </resources>
  <library><event name="crayZmundo"><project name="${esc(t.title)}"><sequence format="r1" duration="${r(dur)}"><spine>
    <asset-clip ref="r2" name="${esc(t.title)}" offset="0s" start="${r(t.start_ms)}" duration="${r(dur)}"/>
  </spine></sequence></project></event></library>
</fcpxml>
` };
  }
  if (fmt === "premiere") {
    return { name: `${safe}.xml`, body: `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="4"><sequence><name>${esc(t.title)}</name><duration>${fr(dur)}</duration><rate><timebase>${fps}</timebase></rate>
<media><video><track><clipitem id="c1"><name>${esc(t.title)}</name><start>0</start><end>${fr(dur)}</end><in>${fr(t.start_ms)}</in><out>${fr(t.end_ms)}</out>
<file id="f1"><name>${esc(t.sourceName)}</name><pathurl>${esc(t.sourceUrl)}</pathurl><rate><timebase>${fps}</timebase></rate><duration>${fr(t.sourceMs)}</duration></file>
</clipitem></track></video></media></sequence></xmeml>
` };
  }
  const tc = (ms: number) => { const f = fr(ms); const s = Math.floor(f / fps); const p = (n: number) => String(n).padStart(2, "0"); return `${p(Math.floor(s / 3600))}:${p(Math.floor(s / 60) % 60)}:${p(s % 60)}:${p(f % fps)}`; };
  return { name: `${safe}.edl`, body: `TITLE: ${t.title}
FCM: NON-DROP FRAME

001  AX       AA/V  C        ${tc(t.start_ms)} ${tc(t.end_ms)} 00:00:00:00 ${tc(dur)}
* FROM CLIP NAME: ${t.sourceName}
` };
}
