/** Library rules from Build Pack Prompt 2: upload limits, kinds, badges, link types. */
export type UploadKind = "VIDEO" | "AUDIO" | "IMAGE" | "FONT" | "SUBTITLE";
const MB = 1024 * 1024;
export const LIMITS: Record<UploadKind, { max: number; exts: string[] }> = {
  VIDEO: { max: 4 * 1024 * MB, exts: ["mp4", "mov", "webm", "mkv", "avi", "m4v", "mpg", "wmv", "flv", "3gp"] },
  AUDIO: { max: 100 * MB, exts: ["mp3", "m4a", "wav", "aac", "ogg", "flac"] },
  IMAGE: { max: 20 * MB, exts: ["jpg", "jpeg", "png", "webp", "gif"] },
  FONT: { max: 5 * MB, exts: ["ttf", "otf", "woff2"] },
  SUBTITLE: { max: 2 * MB, exts: ["srt", "vtt"] },
};
export const LIMITS_TEXT = "Video up to 4 GB (mp4, mov, webm, mkv, avi, m4v, mpg, wmv, flv, 3gp) · Audio up to 100 MB (mp3, m4a, wav, aac, ogg, flac) · Images up to 20 MB (jpg, png, webp, gif) · Fonts up to 5 MB (ttf, otf, woff2) · Subtitles .srt/.vtt up to 2 MB";

export const extOf = (name: string) => (name.split(".").pop() ?? "").toLowerCase();
export function kindOf(name: string): UploadKind | null {
  const e = extOf(name);
  for (const k of Object.keys(LIMITS) as UploadKind[]) if (LIMITS[k].exts.includes(e)) return k;
  return null;
}
/** Returns an error message, or null when the file may be uploaded. */
export function validateUpload(name: string, size: number): string | null {
  const k = kindOf(name);
  if (!k) return `“${extOf(name) || name}” files are not supported.`;
  if (size > LIMITS[k].max) return `${k.toLowerCase()} files can be at most ${formatBytes(LIMITS[k].max)}.`;
  return null;
}
export function formatBytes(n: number | null | undefined) {
  if (!n) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB"]; let i = 0; let v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v >= 10 || i === 0 ? Math.round(v) : v.toFixed(1)} ${u[i]}`;
}
export function formatDuration(ms: number | null | undefined) {
  if (!ms) return "—";
  const s = Math.round(ms / 1000); const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const r = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
}
/** 2160p / 1080p / 720p badge from the shorter side. */
export function resolutionBadge(w: number | null | undefined, h: number | null | undefined) {
  if (!w || !h) return null;
  const s = Math.min(w, h);
  if (s >= 2160) return "2160p"; if (s >= 1080) return "1080p"; if (s >= 720) return "720p";
  return `${s}p`;
}
export const upscaleFactor = (height: number) => Math.round((1920 / height) * 0.5625 * 10) / 10;
export function upscaleNote(height: number | null | undefined) {
  if (!height || height >= 2160) return null;
  return `Full-screen vertical crops from a ${height}p landscape source are upscaled about ${upscaleFactor(height)}x; use Streamer, Both speakers or Letterbox for the sharpest result, or import the 4K version when the channel offers one.`;
}
/** Direct file URL (public https .mp4 etc.) vs. a page link the Engine resolves (needs rights confirmation). */
export function isDirectFileUrl(url: string) {
  try { const u = new URL(url); return u.protocol === "https:" && LIMITS.VIDEO.exts.includes(extOf(u.pathname)); } catch { return false; }
}
export const TRASH_PURGE_DAYS = 30;
export function purgeCutoff(now = new Date()) { return new Date(now.getTime() - TRASH_PURGE_DAYS * 86400000); }
export const ASSET_TAB_SOURCE = { "B-roll": "BROLL", Music: "MUSIC", "Sound effects": "SFX", Images: "IMAGE", Fonts: "FONT" } as const;
export const ASSET_TYPE_FOR: Record<UploadKind, "VIDEO" | "AUDIO" | "IMAGE" | "FONT" | null> = { VIDEO: "VIDEO", AUDIO: "AUDIO", IMAGE: "IMAGE", FONT: "FONT", SUBTITLE: null };
export const BROLL_TAGS = ["gameplay", "satisfying", "nature", "driving", "cooking"];
