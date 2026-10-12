import { durationSeconds, isLongForm } from "./agency-rules";
export async function fetchIdeationChannel(url: string) {
  const key = process.env["YOUTUBE_API_KEY"];
  if (!key)
    return {
      unavailable:
        "YouTube is not connected yet. Channel lookups need a YouTube API key in managed secrets.",
    };
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { unavailable: "Enter a valid YouTube channel URL." };
  }
  if (!["youtube.com", "www.youtube.com"].includes(parsed.hostname))
    return { unavailable: "Use a YouTube channel URL." };
  const parts = parsed.pathname.split("/").filter(Boolean);
  const id = parts[0] === "channel" ? parts[1] : null;
  const handle = parts[0]?.startsWith("@") ? parts[0] : null;
  if (!id && !handle) return { unavailable: "Use a channel ID URL or an @handle URL." };
  async function youtube(path: string, params: Record<string, string>) {
    const query = new URLSearchParams({ ...params, key: key || "" });
    const response = await fetch(`https://www.googleapis.com/youtube/v3/${path}?${query}`);
    if (!response.ok)
      throw new Error(
        `YouTube [${response.status}]: ${(await response.text()).replaceAll(key || "", "[redacted]")}`,
      );
    return response.json();
  }
  const channels = await youtube("channels", {
    part: "snippet,contentDetails",
    ...(id ? { id } : { forHandle: handle || "" }),
  });
  const channel = channels.items?.[0];
  if (!channel) return { unavailable: "Channel not found." };
  const playlist = await youtube("playlistItems", {
    part: "snippet",
    playlistId: channel.contentDetails.relatedPlaylists.uploads,
    maxResults: "50",
  });
  const ids = (playlist.items || [])
    .map(
      (video: { snippet: { resourceId: { videoId: string } } }) => video.snippet.resourceId.videoId,
    )
    .join(",");
  const videos = ids
    ? await youtube("videos", { part: "snippet,contentDetails,statistics", id: ids })
    : { items: [] };
  return {
    channel: channel.snippet,
    videos: (videos.items || [])
      .map(
        (video: {
          id: string;
          snippet: { title: string; publishedAt: string };
          contentDetails: { duration: string };
          statistics: unknown;
        }) => ({
          id: video.id,
          title: video.snippet.title,
          publishedAt: video.snippet.publishedAt,
          seconds: durationSeconds(video.contentDetails.duration),
          statistics: video.statistics,
        }),
      )
      .filter((video: { seconds: number }) => isLongForm(video.seconds)),
  };
}
