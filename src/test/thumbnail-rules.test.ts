import { describe, expect, it } from "vitest";
import { HIGGSFIELD_MODEL, groupMessages, higgsfieldBody, historyLine, validRating } from "@/lib/thumbnail-rules";
const row = (id: string, content: string, image_url: string | null = null, rating: number | null = null) => ({ id, role: "assistant", content, image_url, rating });
describe("thumbnail rules", () => {
  it("uses nano-banana-pro at 16:9 and 4K", () => {
    expect(HIGGSFIELD_MODEL).toBe("nano-banana-pro");
    expect(higgsfieldBody("x", 1)).toMatchObject({ aspect_ratio: "16:9", resolution: "4k", num_images: 1 });
  });
  it("asks for 3 images for variations", () => expect(higgsfieldBody("x", 3).num_images).toBe(3));
  it("accepts only 1-5 star ratings", () => {
    expect(validRating(1)).toBe(true); expect(validRating(5)).toBe(true);
    expect(validRating(0)).toBe(false); expect(validRating(6)).toBe(false); expect(validRating(2.5)).toBe(false);
  });
  it("tells the AI which images were rated", () => expect(historyLine(row("a", "image\np", "u", 4))).toContain("rated 4/5"));
  it("groups the 3 variations into one carousel", () => {
    const g = groupMessages([row("a", "hi"), row("b", "variation:1\np", "u"), row("c", "variation:1\np", "u"), row("d", "variation:1\np", "u"), row("e", "image\np", "u")]);
    expect(g).toHaveLength(3);
    expect(Array.isArray(g[1]) && g[1].length).toBe(3);
  });
});
