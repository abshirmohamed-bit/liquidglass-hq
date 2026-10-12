export type SuggestionKind = "TITLES" | "IDEAS";
export const TITLE_VIDEOS = 5;
export const TITLES_PER_VIDEO = 3;
/** Client tools read global VIDEO knowledge plus this client-only scope. */
export function clientScope(kind: SuggestionKind) {
  return kind === "TITLES" ? "CLIENT_TITLES" : "CLIENT_IDEAS";
}
/** Newest long-form uploads first, capped to the last five. */
export function lastLongForm<T extends { publishedAt: string; seconds: number }>(videos: T[]) {
  return [...videos]
    .filter((v) => v.seconds >= 240)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, TITLE_VIDEOS);
}
export type TitleGroup = { original: string; titles: string[] };
export type Idea = { title: string; description: string };
