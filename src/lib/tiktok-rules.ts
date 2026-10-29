/** TikTok Content Posting API rules shared by the post form, the server and tests. */

export const TIKTOK_SCOPES = ["user.info.basic", "video.publish"] as const;
export const TIKTOK_CALLBACK_PATH = "/api/public/tiktok/callback";

export type TikTokPrivacy = "PUBLIC_TO_EVERYONE" | "MUTUAL_FOLLOW_FRIENDS" | "FOLLOWER_OF_CREATOR" | "SELF_ONLY";
export const PRIVACY_LABELS: Record<string, string> = {
  PUBLIC_TO_EVERYONE: "Everyone",
  MUTUAL_FOLLOW_FRIENDS: "Friends",
  FOLLOWER_OF_CREATOR: "Followers",
  SELF_ONLY: "Only me",
};

export type TikTokOptions = {
  privacy: TikTokPrivacy | "";
  allowComment: boolean;
  allowDuet: boolean;
  allowStitch: boolean;
  /** Commercial content disclosure. */
  disclose: boolean;
  yourBrand: boolean;
  brandedContent: boolean;
};

export const DEFAULT_TIKTOK_OPTIONS: TikTokOptions = {
  privacy: "", allowComment: false, allowDuet: false, allowStitch: false,
  disclose: false, yourBrand: false, brandedContent: false,
};

/** Why these options can't be posted, or null. Follows TikTok's direct-post UX guidelines. */
export function tiktokOptionsIssue(o: TikTokOptions, allowed: string[], durationSec: number, maxSec: number | null): string | null {
  if (!o.privacy) return "Choose who can see this TikTok.";
  if (allowed.length && !allowed.includes(o.privacy)) return "That privacy option isn't available for this account.";
  if (o.disclose && !o.yourBrand && !o.brandedContent) return "Say whether this promotes your brand, a third party, or both.";
  if (o.brandedContent && o.privacy === "SELF_ONLY") return "Branded content can't be private.";
  if (maxSec && durationSec > maxSec) return `This account can post videos up to ${maxSec} s.`;
  return null;
}

/** The consent line TikTok requires right above the post button. */
export function tiktokConsent(o: TikTokOptions): string {
  return o.brandedContent
    ? "By posting, you agree to TikTok's Branded Content Policy and Music Usage Confirmation."
    : "By posting, you agree to TikTok's Music Usage Confirmation.";
}

const MB = 1024 * 1024;
/** Chunk plan for FILE_UPLOAD: one chunk up to 64 MB, else 10 MB chunks with the remainder folded into the last. */
export function chunkPlan(size: number): { chunkSize: number; count: number } {
  if (size <= 64 * MB) return { chunkSize: size, count: 1 };
  const chunkSize = 10 * MB;
  return { chunkSize, count: Math.floor(size / chunkSize) };
}

export function postInfo(caption: string, o: TikTokOptions) {
  return {
    title: caption.slice(0, 2200),
    privacy_level: o.privacy,
    disable_comment: !o.allowComment,
    disable_duet: !o.allowDuet,
    disable_stitch: !o.allowStitch,
    brand_content_toggle: o.disclose && o.brandedContent,
    brand_organic_toggle: o.disclose && o.yourBrand,
  };
}
