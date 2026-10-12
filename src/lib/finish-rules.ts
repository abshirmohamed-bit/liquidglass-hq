/** Finish rules (Build Pack Prompt 5): caption presets, custom styles, title/watermark, and the ASS file burned in on export. */
export type CaptionStyle = {
  size: number; // px at a 1080-wide frame
  fill: string; outline: string; outlineW: number; shadow: boolean;
  box: boolean; boxColor: string; boxOpacity: number; // 0..1
  uppercase: boolean; active: string | null; animation: "none" | "pop" | "karaoke" | "bounce" | "typewriter";
  maxWords: number; x: number; y: number; // position in % of the frame
};
export const DEFAULT_STYLE: CaptionStyle = { size: 64, fill: "#FFFFFF", outline: "#000000", outlineW: 4, shadow: true, box: false, boxColor: "#000000", boxOpacity: 0.6, uppercase: false, active: null, animation: "none", maxWords: 4, x: 50, y: 72 };

const p = (s: Partial<CaptionStyle>): Partial<CaptionStyle> => s;
export const CAPTION_PRESETS: { id: string; name: string; style: Partial<CaptionStyle> }[] = [
  { id: "bold_white", name: "Bold white", style: p({}) },
  { id: "yellow_pop", name: "Yellow pop", style: p({ fill: "#FFE600", animation: "pop" }) },
  { id: "outlined", name: "Outlined", style: p({ outlineW: 7, shadow: false }) },
  { id: "boxed", name: "Boxed", style: p({ box: true, outlineW: 0 }) },
  { id: "neon", name: "Neon", style: p({ fill: "#64D2FF", outline: "#0A84FF", outlineW: 5 }) },
  { id: "minimal", name: "Minimal", style: p({ size: 48, outlineW: 2, shadow: false }) },
  { id: "karaoke", name: "Karaoke highlight", style: p({ active: "#30D158", animation: "karaoke" }) },
  { id: "word_pop", name: "Word pop", style: p({ maxWords: 1, size: 84, animation: "pop", uppercase: true }) },
  { id: "two_colour", name: "Two colour speaker", style: p({ fill: "#FFFFFF", active: "#FF9F0A", animation: "karaoke" }) },
  { id: "lower_third", name: "Lower-third", style: p({ size: 48, box: true, y: 86, maxWords: 7 }) },
  { id: "uppercase_impact", name: "Uppercase impact", style: p({ uppercase: true, size: 76, outlineW: 6 }) },
  { id: "handwritten", name: "Handwritten", style: p({ size: 60, outlineW: 3 }) },
  { id: "bounce", name: "Bounce", style: p({ animation: "bounce", fill: "#BF5AF2" }) },
  { id: "typewriter", name: "Typewriter", style: p({ animation: "typewriter", size: 52, maxWords: 6 }) },
  { id: "glow_box", name: "Glow box", style: p({ box: true, boxColor: "#0A84FF", boxOpacity: 0.8, outlineW: 0 }) },
  { id: "highlighter", name: "Highlighter", style: p({ box: true, boxColor: "#FFE600", boxOpacity: 1, fill: "#000000", outlineW: 0 }) },
  { id: "comic", name: "Comic", style: p({ fill: "#FFE600", outline: "#FF453A", outlineW: 6, uppercase: true }) },
  { id: "serif_quote", name: "Serif quote", style: p({ size: 56, outlineW: 2, maxWords: 6 }) },
  { id: "clean_caps", name: "Clean caps", style: p({ uppercase: true, size: 54, outlineW: 3, shadow: false }) },
  { id: "podcast_bar", name: "Podcast bar", style: p({ box: true, y: 82, size: 50, maxWords: 6, active: "#FFE600", animation: "karaoke" }) },
];
export function styleFor(presetId: string | null | undefined, custom?: Partial<CaptionStyle> | null): CaptionStyle {
  const preset = CAPTION_PRESETS.find((x) => x.id === presetId) ?? CAPTION_PRESETS[0]!;
  return { ...DEFAULT_STYLE, ...preset.style, ...(custom ?? {}) };
}

export const TITLE_STYLES = ["bold_band", "boxed", "minimal", "headline"] as const;
export type TitleStyle = (typeof TITLE_STYLES)[number];
export const TITLE_STYLE_NAMES: Record<TitleStyle, string> = { bold_band: "Bold top band", boxed: "Boxed", minimal: "Minimal", headline: "Headline (one highlighted word)" };
export const HIGHLIGHTS = { red: "#FF453A", yellow: "#FFE600", blue: "#0A84FF" } as const;
export type Overlays = { title?: { y: number; highlight_word?: string; highlight?: keyof typeof HIGHLIGHTS }; watermark?: { pos: WatermarkPos; opacity: number } };
export const WATERMARK_POS = ["top-left", "top-right", "bottom-left", "bottom-right", "centre-below-captions"] as const;
export type WatermarkPos = (typeof WATERMARK_POS)[number];
export const ASPECTS = ["9:16", "1:1", "4:5", "16:9"] as const;

export type Cue = { start_ms: number; end_ms: number; text: string };
export type Word = { start_ms: number; end_ms: number; text: string };

/** Transcribed audio chunks → words with evenly spread timings inside each chunk. */
export function wordsFromChunks(chunks: Cue[]): Word[] {
  const out: Word[] = [];
  for (const c of chunks) {
    const ws = c.text.split(/\s+/).filter(Boolean);
    const step = (c.end_ms - c.start_ms) / Math.max(1, ws.length);
    ws.forEach((w, i) => out.push({ start_ms: Math.round(c.start_ms + i * step), end_ms: Math.round(c.start_ms + (i + 1) * step), text: w }));
  }
  return out;
}
/** Words → caption cues of at most maxWords words. */
export function cuesFromWords(words: Word[], maxWords: number): Cue[] {
  const n = Math.max(1, Math.min(12, Math.round(maxWords)));
  const out: Cue[] = [];
  for (let i = 0; i < words.length; i += n) { const g = words.slice(i, i + n); out.push({ start_ms: g[0]!.start_ms, end_ms: g[g.length - 1]!.end_ms, text: g.map((w) => w.text).join(" ") }); }
  return out;
}
/** Edited cue text → words again (timings spread inside the cue). */
export const wordsFromCues = (cues: Cue[]) => wordsFromChunks(cues);
/** The cue shown at a given source time. */
export const cueAt = (cues: Cue[], ms: number) => cues.find((c) => ms >= c.start_ms && ms < c.end_ms) ?? null;

/** Source-time → output-time for the clip's segments (gaps removed); null when outside. */
export function toOutput(ms: number, segments: { start_ms: number; end_ms: number }[]): number | null {
  let acc = 0;
  for (const s of segments) { if (ms >= s.start_ms && ms <= s.end_ms) return acc + ms - s.start_ms; acc += s.end_ms - s.start_ms; }
  return null;
}

const assColor = (hex: string, alpha = 0) => { const h = hex.replace("#", "").padEnd(6, "0"); const a = Math.round(alpha * 255).toString(16).padStart(2, "0"); return `&H${a}${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}`.toUpperCase(); };
const assTime = (ms: number) => { const t = Math.max(0, Math.round(ms / 10)); const cs = t % 100, s = Math.floor(t / 100) % 60, m = Math.floor(t / 6000) % 60, h = Math.floor(t / 360000); return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`; };
const esc = (t: string) => t.replace(/[{}\\]/g, "").replace(/\n/g, "\\N");

export type AssInput = {
  w: number; h: number; durationMs: number; segments: { start_ms: number; end_ms: number }[];
  cues: Cue[]; style: CaptionStyle; captionsOn: boolean;
  title?: { text: string; style: TitleStyle; y: number; highlight_word?: string | undefined; highlight?: keyof typeof HIGHLIGHTS | undefined } | null;
  watermark?: { text: string; pos: WatermarkPos; opacity: number } | null;
};
/** Builds the .ass subtitle file ffmpeg burns into the export, matching the editor preview. */
export function toAss(a: AssInput): string {
  const k = a.w / 1080, s = a.style;
  const size = Math.round(s.size * k), ow = Math.round(s.outlineW * k);
  const border = s.box ? 3 : 1;
  const back = s.box ? assColor(s.boxColor, 1 - s.boxOpacity) : assColor("#000000", 0.4);
  const styles = [
    `Style: Cap,Montserrat,${size},${assColor(s.fill)},${assColor(s.active ?? s.fill)},${s.box ? back : assColor(s.outline)},${back},-1,0,0,0,100,100,0,0,${border},${s.box ? Math.round(10 * k) : ow},${s.shadow && !s.box ? Math.round(3 * k) : 0},5,0,0,0,1`,
    `Style: Title,Montserrat,${Math.round(66 * k)},&H00FFFFFF,&H00FFFFFF,&H00000000,&H66000000,-1,0,0,0,100,100,0,0,${a.title?.style === "boxed" || a.title?.style === "bold_band" ? 3 : 1},${Math.round(5 * k)},0,5,0,0,0,1`,
    `Style: Mark,Montserrat,${Math.round(34 * k)},${assColor("#FFFFFF", 1 - (a.watermark?.opacity ?? 0.5))},&H00FFFFFF,&H80000000,&H00000000,-1,0,0,0,100,100,0,0,1,${Math.round(2 * k)},0,5,0,0,0,1`,
  ];
  const ev: string[] = [];
  const px = Math.round((s.x / 100) * a.w), py = Math.round((s.y / 100) * a.h);
  const pop = s.animation === "pop" || s.animation === "bounce" ? "\\fscx80\\fscy80\\t(0,120,\\fscx100\\fscy100)" : "";
  if (a.captionsOn) for (const c of a.cues) {
    const st = toOutput(c.start_ms, a.segments), en = toOutput(c.end_ms, a.segments);
    if (st == null || en == null || en <= st) continue;
    const text = s.uppercase ? c.text.toUpperCase() : c.text;
    if (s.active && (s.animation === "karaoke")) {
      const ws = text.split(/\s+/).filter(Boolean), step = (en - st) / Math.max(1, ws.length);
      ws.forEach((_, i) => {
        const line = ws.map((w, j) => (j === i ? `{\\c${assColor(s.active!)}}${esc(w)}{\\c${assColor(s.fill)}}` : esc(w))).join(" ");
        ev.push(`Dialogue: 0,${assTime(st + i * step)},${assTime(st + (i + 1) * step)},Cap,,0,0,0,,{\\pos(${px},${py})}${line}`);
      });
    } else if (s.animation === "typewriter") {
      const ws = text.split(/\s+/).filter(Boolean), step = (en - st) / Math.max(1, ws.length);
      ws.forEach((_, i) => ev.push(`Dialogue: 0,${assTime(st + i * step)},${assTime(i === ws.length - 1 ? en : st + (i + 1) * step)},Cap,,0,0,0,,{\\pos(${px},${py})}${esc(ws.slice(0, i + 1).join(" "))}`));
    } else ev.push(`Dialogue: 0,${assTime(st)},${assTime(en)},Cap,,0,0,0,,{\\pos(${px},${py})${pop}}${esc(text)}`);
  }
  if (a.title?.text.trim()) {
    const t = a.title, hw = (t.highlight_word ?? "").trim().toLowerCase();
    const col = assColor(HIGHLIGHTS[t.highlight ?? "yellow"]);
    const words = t.text.trim().split(/\s+/).map((w) => (t.style === "headline" && hw && w.toLowerCase().replace(/[^\w']/g, "") === hw.replace(/[^\w']/g, "") ? `{\\c${col}}${esc(w)}{\\c&H00FFFFFF&}` : esc(w)));
    const body = t.style === "headline" || t.style === "bold_band" ? words.join(" ").toUpperCase() : words.join(" ");
    ev.push(`Dialogue: 1,${assTime(0)},${assTime(a.durationMs)},Title,,0,0,0,,{\\pos(${Math.round(a.w / 2)},${Math.round((t.y / 100) * a.h)})${t.style === "minimal" ? "\\bord2" : ""}}${body.replace(/\{\\C/g, "{\\c")}`);
  }
  if (a.watermark?.text.trim()) {
    const m = 40 * k, pos = a.watermark.pos;
    const x = pos.endsWith("left") ? m + 120 * k : pos.endsWith("right") ? a.w - m - 120 * k : a.w / 2;
    const y = pos.startsWith("top") ? m + 30 * k : pos.startsWith("bottom") ? a.h - m - 30 * k : Math.min(a.h - m, py + size * 1.6);
    ev.push(`Dialogue: 2,${assTime(0)},${assTime(a.durationMs)},Mark,,0,0,0,,{\\pos(${Math.round(x)},${Math.round(y)})}${esc(a.watermark.text)}`);
  }
  return ["[Script Info]", "ScriptType: v4.00+", `PlayResX: ${a.w}`, `PlayResY: ${a.h}`, "WrapStyle: 0", "ScaledBorderAndShadow: yes", "", "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    ...styles, "", "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text", ...ev, ""].join("\n");
}

/** Post copy limits (Prompt 7) used before a post is queued. */
export const COPY_LIMITS = { INSTAGRAM: 2200, TIKTOK: 2200, YOUTUBE: 100, X: 280, FACEBOOK: 2200, LINKEDIN: 3000 } as const;
export type Platform = keyof typeof COPY_LIMITS;
export function copyIssue(platform: Platform, text: string): string | null {
  if (!text.trim()) return "Write a caption first.";
  return text.length > COPY_LIMITS[platform] ? `${platform[0] + platform.slice(1).toLowerCase()} allows ${COPY_LIMITS[platform]} characters (${text.length} now).` : null;
}
/** Board column a post belongs to; manual posts past their slot are "Due now". */
export function postColumn(p: { status: string; mode: string; scheduled_at: string | null }, now = Date.now()): "Scheduled" | "Due now" | "Posting" | "Posted" | "Failed" | "Skipped" {
  if (p.status === "POSTED") return "Posted";
  if (p.status === "FAILED") return "Failed";
  if (p.status === "SKIPPED") return "Skipped";
  if (p.status === "POSTING") return "Posting";
  if (p.status === "AWAITING_MANUAL") return "Due now";
  if (p.mode === "MANUAL" && (!p.scheduled_at || new Date(p.scheduled_at).getTime() <= now)) return "Due now";
  return "Scheduled";
}
/** Deep links that open each platform's upload page for manual posting. */
export function uploadLink(platform: Platform, text: string): string {
  switch (platform) {
    case "YOUTUBE": return "https://studio.youtube.com/channel/UC/videos/upload?d=ud";
    case "TIKTOK": return "https://www.tiktok.com/tiktokstudio/upload";
    case "X": return `https://x.com/intent/post?text=${encodeURIComponent(text)}`;
    case "INSTAGRAM": return "https://www.instagram.com/";
    case "FACEBOOK": return "https://www.facebook.com/";
    case "LINKEDIN": return "https://www.linkedin.com/feed/?shareActive=true";
  }
}
