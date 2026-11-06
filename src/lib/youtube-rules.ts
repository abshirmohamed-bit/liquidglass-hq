/** YouTube Data API v3 direct-upload rules shared by the post form, the server and tests. */

export const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
] as const;
export const YOUTUBE_CALLBACK_PATH = "/api/public/youtube/callback";

export type YouTubePrivacy = "public" | "unlisted" | "private";
export const YOUTUBE_PRIVACY_LABELS: Record<YouTubePrivacy, string> = {
  public: "Public",
  unlisted: "Unlisted",
  private: "Private",
};

export type YouTubeOptions = {
  privacy: YouTubePrivacy | "";
  madeForKids: boolean;
};

export const DEFAULT_YOUTUBE_OPTIONS: YouTubeOptions = { privacy: "", madeForKids: false };

/** Why these options can't be posted, or null. */
export function youtubeOptionsIssue(o: YouTubeOptions, title: string, description: string): string | null {
  if (!o.privacy) return "Choose who can see this YouTube video.";
  if (!title.trim()) return "YouTube needs a title.";
  if (title.length > 100) return "YouTube titles are 100 characters or less.";
  if (description.length > 5000) return "YouTube descriptions are 5000 characters or less.";
  return null;
}

/** The snippet + status payload for the resumable-upload init call. */
export function uploadMetadata(title: string, description: string, o: YouTubeOptions) {
  return {
    snippet: { title: title.slice(0, 100), description: description.slice(0, 5000), categoryId: "22" },
    status: { privacyStatus: o.privacy, selfDeclaredMadeForKids: o.madeForKids },
  };
}
