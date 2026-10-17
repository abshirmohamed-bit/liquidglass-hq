/**
 * Prompt 3 (Clip jobs) — shared rules for the AutoClip form, validation,
 * summaries and job presentation. Pure module: the Clips UI, the internal
 * pipeline and the tests all read from here so decisions never diverge.
 */

export const MIN_SOURCE_MS = 60_000; // 1 minute
export const MAX_SOURCE_MS = 3 * 60 * 60 * 1000; // 3 hours
export const DONT_CLIP_MAX_MS = 15 * 60 * 1000; // "Don't clip" caps at 15 minutes
export const MAX_MUST_INCLUDE = 10;
export const MAX_PROMPT_CHARS = 500;
export const HEADLINE_TOP_DEFAULT = 10;
export const CLIP_COUNT_MIN = 2;
export const CLIP_COUNT_MAX = 60;
export const CLIP_LENGTH_PRESETS = [30, 60, 90, 120, 180] as const;

/** The length bands the picker offers. "auto" lets the AI choose per clip. */
export const LENGTH_BANDS: { value: string; label: string; min_s: number; max_s: number }[] = [
  { value: "auto", label: "Auto", min_s: 0, max_s: 0 },
  { value: "lt30", label: "<30s", min_s: 15, max_s: 29 },
  { value: "30_59", label: "30s~59s", min_s: 30, max_s: 59 },
  { value: "60_89", label: "60s~89s", min_s: 60, max_s: 89 },
  { value: "90_180", label: "90s~3m", min_s: 90, max_s: 180 },
  { value: "180_300", label: "3m~5m", min_s: 180, max_s: 300 },
  { value: "300_600", label: "5m~10m", min_s: 300, max_s: 600 },
  { value: "600_900", label: "10m~15m", min_s: 600, max_s: 900 },
];

export const bandByValue = (v: string) => LENGTH_BANDS.find((b) => b.value === v) ?? LENGTH_BANDS[0]!;
export const QUEUE_MINUTES_PER_JOB = 2;

export type Coverage = "BEST_MOMENTS" | "WHOLE_VIDEO" | "DONT_CLIP";
export type ClipMode = "AUTO" | "SPEECH" | "ENERGY" | "VISUAL";
export type EditLevel = "cuts_only" | "captions" | "cropped" | "full";
export type Aspect = "9:16" | "1:1" | "4:5" | "16:9";
export type LayoutValue = "full_video" | "streamer" | "split" | "two_up" | "three_up" | "four_up" | "screenshare" | "black_box" | "title_subtitles";
export type ClipLength = "auto" | number | { min_s: number; max_s: number };

export const COVERAGE_OPTIONS: { value: Coverage; label: string; hint: string }[] = [
  { value: "BEST_MOMENTS", label: "Best moments", hint: "Find the strongest moments across the whole video." },
  { value: "WHOLE_VIDEO", label: "Whole video", hint: "Clip everything, skipping intros, outros, ads and dead air." },
  { value: "DONT_CLIP", label: "Don't clip", hint: "Make one clip of up to 15 minutes." },
];

export const GENRES = ["Auto", "Q&A", "Commentary", "Marketing", "Webinar", "Motivational speech", "Podcast", "Academic", "Listicle", "Product reviews", "How-to", "Comedy", "Sports commentary", "Church", "News", "Vlog"] as const;

export const MODE_OPTIONS: { value: ClipMode; label: string; hint: string }[] = [
  { value: "AUTO", label: "Auto", hint: "Speech mode when the source has speech, otherwise visual." },
  { value: "SPEECH", label: "Speech", hint: "Follow the words being said." },
  { value: "ENERGY", label: "Energy", hint: "Follow audio intensity." },
  { value: "VISUAL", label: "Visual", hint: "Follow scene changes." },
];

export const EDIT_LEVELS: { value: EditLevel; label: string }[] = [
  { value: "cuts_only", label: "Cuts only" },
  { value: "captions", label: "Captions" },
  { value: "cropped", label: "Cropped" },
  { value: "full", label: "Full" },
];

export const ASPECT_OPTIONS: Aspect[] = ["9:16", "1:1", "4:5", "16:9"];

export const LAYOUT_OPTIONS: { value: LayoutValue; label: string }[] = [
  { value: "full_video", label: "Full video" },
  { value: "streamer", label: "Streamer" },
  { value: "split", label: "Split" },
  { value: "two_up", label: "Two-up" },
  { value: "three_up", label: "Three-up" },
  { value: "four_up", label: "Four-up" },
  { value: "screenshare", label: "Screenshare" },
  { value: "black_box", label: "Black box" },
  { value: "title_subtitles", label: "Title + subtitles" },
];

export const FRAMING_OPTIONS: { value: string; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "both", label: "Both speakers" },
  { value: "centre", label: "Centre" },
];

export const ZOOM_LEVELS = ["Subtle", "Balanced", "Dynamic", "Max"] as const;
export const GRADE_PRESETS = ["none", "warm", "cool", "punchy"] as const;
export const SPOKEN_LANGUAGES: { value: string; label: string }[] = [
  { value: "auto", label: "Auto detect" },
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "pt", label: "Portuguese" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "it", label: "Italian" },
  { value: "ar", label: "Arabic" },
  { value: "hi", label: "Hindi" },
  { value: "ru", label: "Russian" },
  { value: "ja", label: "Japanese" },
  { value: "ko", label: "Korean" },
];

export const STAGE_LABELS: Record<string, string> = {
  FINDING: "Finding moments",
  BUILDING: "Building clips",
};

/** Reason a source cannot be clipped, or null when it qualifies (1 min – 3 h). */
export function sourceDurationIssue(durationMs: number | null | undefined): string | null {
  if (durationMs == null) return "This source has no length recorded yet, so it can't be clipped.";
  if (durationMs < MIN_SOURCE_MS || durationMs > MAX_SOURCE_MS) return "Source must be a video between 1 minute and 3 hours";
  return null;
}

/** Reason the chosen part is invalid, or null. */
export function rangeIssue(startMs: number | null, endMs: number | null, durationMs: number | null | undefined): string | null {
  if (startMs == null && endMs == null) return null;
  if (startMs == null || endMs == null) return "Set both a start and an end, or clear the range.";
  if (startMs < 0 || endMs <= startMs) return "The end of the range must come after the start.";
  if (durationMs != null && endMs > durationMs) return "The range goes past the end of the video.";
  return null;
}

/** The source's niche sets the default genre. */
export function defaultGenreFor(niche: string | null | undefined): string {
  const n = (niche ?? "").toLowerCase();
  if (/religio|church|faith|sermon|gospel/.test(n)) return "Church";
  if (/podcast|interview|talk/.test(n)) return "Podcast";
  if (/politic|election|govern|civic/.test(n)) return "Commentary";
  if (/news|current affairs|journalis/.test(n)) return "News";
  if (/entertain|comedy|gaming|reaction|vlog/.test(n)) return "Comedy";
  return "Auto";
}

/** How many clips "Let AI decide" suggests: one per ~4 minutes, 2–60. */
export function suggestedClipCount(durationMs: number | null | undefined): number {
  const ms = durationMs ?? 0;
  if (ms <= 0) return CLIP_COUNT_MIN;
  return Math.min(CLIP_COUNT_MAX, Math.max(CLIP_COUNT_MIN, Math.round(ms / 240_000)));
}

/** Reads the length picker into a ClipLength, or an error string. */
export function parseClipLength(preset: string, minS: number, maxS: number): ClipLength | { error: string } {
  if (preset === "auto") return "auto";
  const n = Number(preset);
  if (CLIP_LENGTH_PRESETS.some((p) => p === n)) return n;
  const lo = Math.round(minS); const hi = Math.round(maxS);
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo < 15 || hi > 900 || hi <= lo) return { error: "Custom length must be 15s to 900s, with the max above the min." };
  return { min_s: lo, max_s: hi };
}

export function lengthLabel(cl: ClipLength | null | undefined): string {
  if (cl == null || cl === "auto") return "auto length";
  if (typeof cl === "number") return `${cl}s clips`;
  return `${cl.min_s}–${cl.max_s}s clips`;
}

export function coverageLabel(c: string | null | undefined): string {
  return COVERAGE_OPTIONS.find((o) => o.value === c)?.label ?? c ?? "Best moments";
}

export function editLevelLabel(e: string | null | undefined): string {
  const hit = EDIT_LEVELS.find((o) => o.value === e);
  return hit ? hit.label : (e ?? "Full");
}

function clipLengthSeconds(cl: ClipLength | null | undefined): number {
  if (typeof cl === "number") return cl;
  if (cl && typeof cl === "object") return Math.round((cl.min_s + cl.max_s) / 2);
  return 90; // Auto length targets 45–120s
}

/** Ordered, non-overlapping cutting plan for one coverage choice. */
export function segmentPlan(rangeMs: number, coverage: Coverage, clipLength: ClipLength | null | undefined, count: number): { start_ms: number; end_ms: number }[] {
  const span = Math.max(1, Math.floor(rangeMs));
  if (coverage === "DONT_CLIP") return [{ start_ms: 0, end_ms: Math.min(span, DONT_CLIP_MAX_MS) }];
  if (coverage === "WHOLE_VIDEO") {
    const len = Math.min(span, clipLengthSeconds(clipLength) * 1000);
    const out: { start_ms: number; end_ms: number }[] = [];
    for (let s = 0; s < span; s += len) out.push({ start_ms: s, end_ms: Math.min(span, s + len) });
    return out;
  }
  const n = Math.max(1, Math.min(count, CLIP_COUNT_MAX));
  const len = Math.min(span, clipLengthSeconds(clipLength) * 1000);
  const step = Math.max(len, Math.floor(span / n));
  const out: { start_ms: number; end_ms: number }[] = [];
  for (let i = 0; i < n; i++) {
    const start = Math.min(span - len, i * step + Math.floor((step - len) / 2));
    const prev = out[out.length - 1];
    if (prev && start < prev.end_ms) continue;
    out.push({ start_ms: Math.max(0, start), end_ms: Math.min(span, start + len) });
  }
  return out;
}

/** Normalises AI-proposed moments: sorted, clamped to the range, non-overlapping. */
export function clampMoments<T extends { start_ms: number; end_ms: number }>(moments: T[], rangeMs: number): T[] {
  const span = Math.max(1, Math.floor(rangeMs));
  const sorted = [...moments]
    .map((m) => ({ ...m, start_ms: Math.max(0, Math.min(Math.round(m.start_ms), span - 1000)), end_ms: Math.max(0, Math.min(Math.round(m.end_ms), span)) }))
    .filter((m) => m.end_ms > m.start_ms)
    .sort((a, b) => a.start_ms - b.start_ms);
  const out: T[] = [];
  for (const m of sorted) {
    const prev = out[out.length - 1];
    if (prev && m.start_ms < prev.end_ms) { if (m.end_ms > prev.end_ms) out[out.length - 1] = { ...prev, end_ms: m.end_ms }; continue; }
    out.push(m);
  }
  return out;
}

/** One-line settings summary for a job card, e.g. "Whole video, auto length, Full, streamer, 9:16". */
export function jobSummary(job: {
  coverage: string | null; clip_length: ClipLength | null; edit_level: string | null; formats: unknown; aspect: string | null;
}): string {
  let firstLayout = "streamer";
  if (job.formats && typeof job.formats === "object" && Array.isArray((job.formats as { layouts?: unknown }).layouts)) {
    const first = ((job.formats as { layouts: unknown[] }).layouts)[0];
    if (typeof first === "string" && LAYOUT_OPTIONS.some((l) => l.value === first)) firstLayout = first;
  }
  return `${coverageLabel(job.coverage)}, ${lengthLabel(job.clip_length)}, ${editLevelLabel(job.edit_level)}, ${firstLayout}, ${job.aspect ?? "9:16"}`;
}

export function formatClock(ms: number | null | undefined): string {
  const total = Math.max(0, Math.round((ms ?? 0) / 1000));
  const h = Math.floor(total / 3600); const m = Math.floor((total % 3600) / 60); const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return h > 0 ? `${h}:${mm}:${String(s).padStart(2, "0")}` : `${mm}:${String(s).padStart(2, "0")}`;
}

export function estimateWaitMinutes(pendingJobs: number): number {
  return Math.max(0, pendingJobs) * QUEUE_MINUTES_PER_JOB;
}

export type JobPill = { label: string; tone: "gray" | "blue" | "orange" | "green" | "red" };

export function statusPill(status: string): JobPill {
  switch (status) {
    case "QUEUED": return { label: "Queued", tone: "gray" };
    case "PROCESSING": return { label: "Processing", tone: "blue" };
    case "AWAITING_CONFIRMATION": return { label: "Awaiting your count", tone: "orange" };
    case "COMPLETED": return { label: "Completed", tone: "green" };
    case "FAILED": return { label: "Failed", tone: "red" };
    default: return { label: status, tone: "gray" };
  }
}

export const ACTIVE_STATUSES = ["QUEUED", "PROCESSING", "AWAITING_CONFIRMATION"];
