export const HIGGSFIELD_MODEL = "nano-banana-pro";
export function higgsfieldBody(prompt: string, count: number) {
  return { prompt, aspect_ratio: "16:9", resolution: "4k", num_images: Math.min(Math.max(count, 1), 4) };
}
export function validRating(rating: number) {
  return Number.isInteger(rating) && rating >= 1 && rating <= 5;
}
export type ThumbRow = { id: string; role: string | null; content: string | null; image_url: string | null; rating: number | null };
/** Turns stored messages into the history text the AI sees, so it remembers tried images and ratings. */
export function historyLine(m: ThumbRow) {
  if (m.image_url) return `[Generated image${m.content?.startsWith("variation") ? " variation" : ""}${m.rating ? `, rated ${m.rating}/5` : ", not rated"}]`;
  return m.content ?? "";
}
/** Groups consecutive variation images into one carousel item. */
export function groupMessages<T extends ThumbRow>(rows: T[]) {
  const out: (T | T[])[] = [];
  for (const r of rows) {
    const last = out[out.length - 1];
    const key = r.content?.startsWith("variation:") ? r.content : null;
    if (key && Array.isArray(last) && last[0].content === key) last.push(r);
    else out.push(key ? [r] : r);
  }
  return out;
}
