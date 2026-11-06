import { uploadMetadata, YOUTUBE_SCOPES, type YouTubeOptions } from "./youtube-rules";
import type { Publisher } from "./publish.server";

function creds() {
  const id = process.env["YOUTUBE_CLIENT_ID"];
  const secret = process.env["YOUTUBE_CLIENT_SECRET"];
  if (!id || !secret) throw new Error("YouTube keys are not set up yet.");
  return { id, secret };
}

export function authorizeUrl(state: string, redirectUri: string) {
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.searchParams.set("client_id", creds().id);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", YOUTUBE_SCOPES.join(" "));
  // offline + consent: a refresh token comes back every time, even on reconnect.
  u.searchParams.set("access_type", "offline");
  u.searchParams.set("prompt", "consent");
  u.searchParams.set("state", state);
  return u.toString();
}

type Token = { access_token: string; refresh_token?: string; expires_in: number; scope: string };

async function tokenRequest(params: Record<string, string>): Promise<Token> {
  const { id, secret } = creds();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: id, client_secret: secret, ...params }),
  });
  const t = (await res.json()) as Token & { error?: string; error_description?: string };
  if (!res.ok || t.error) throw new Error(`YouTube: ${t.error_description || t.error || res.status}`);
  return t;
}

export const exchangeCode = (code: string, redirectUri: string) =>
  tokenRequest({ code, grant_type: "authorization_code", redirect_uri: redirectUri });

export type YouTubeChannel = { id: string; title: string; handle: string | null; thumbnail: string | null };

export async function channelInfo(token: string): Promise<YouTubeChannel> {
  const res = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = (await res.json()) as {
    items?: { id: string; snippet: { title: string; customUrl?: string; thumbnails?: { default?: { url?: string } } } }[];
    error?: { message?: string };
  };
  if (!res.ok || body.error) throw new Error(`YouTube: ${body.error?.message || res.status}`);
  const ch = body.items?.[0];
  if (!ch) throw new Error("That Google account has no YouTube channel.");
  return { id: ch.id, title: ch.snippet.title, handle: ch.snippet.customUrl ?? null, thumbnail: ch.snippet.thumbnails?.default?.url ?? null };
}

/** Upload the file with a resumable session and return the video link. */
export async function directPost(token: string, videoUrl: string, title: string, description: string, o: YouTubeOptions) {
  const file = await fetch(videoUrl);
  if (!file.ok) throw new Error("Couldn't read the exported clip.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const init = await fetch("https://upload.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": "video/mp4",
      "X-Upload-Content-Length": String(bytes.length),
    },
    body: JSON.stringify(uploadMetadata(title, description, o)),
  });
  const session = init.headers.get("location");
  if (!init.ok || !session) throw new Error(`YouTube upload couldn't start (${init.status}): ${(await init.text()).slice(0, 200)}`);
  const up = await fetch(session, {
    method: "PUT",
    headers: { "Content-Type": "video/mp4", "Content-Length": String(bytes.length) },
    body: bytes,
  });
  const done = (await up.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
  if (!up.ok || !done.id) throw new Error(`YouTube rejected the video: ${done.error?.message || up.status}`);
  return { externalId: done.id, url: `https://youtu.be/${done.id}` };
}

export const youtubePublisher: Publisher = {
  async publish(job) {
    const o = (job.options ?? {}) as YouTubeOptions;
    const title = (job.title ?? "").trim() || job.caption.split("\n")[0]!.slice(0, 100) || "New clip";
    return directPost(job.token, job.videoUrl, title, job.caption, {
      madeForKids: !!o.madeForKids,
      privacy: (o.privacy || job.privacy || "private") as YouTubeOptions["privacy"],
    });
  },
  async refresh(refreshToken) {
    const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
    return { accessToken: t.access_token, expiresAt: new Date(Date.now() + t.expires_in * 1000).toISOString() };
  },
};
