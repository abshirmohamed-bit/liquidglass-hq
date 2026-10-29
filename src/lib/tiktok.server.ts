import { chunkPlan, postInfo, TIKTOK_SCOPES, type TikTokOptions } from "./tiktok-rules";
import type { Publisher } from "./publish.server";

const API = "https://open.tiktokapis.com/v2";

function creds() {
  const key = process.env["TIKTOK_CLIENT_KEY"];
  const secret = process.env["TIKTOK_CLIENT_SECRET"];
  if (!key || !secret) throw new Error("TikTok keys are not set up yet.");
  return { key, secret };
}

async function tt<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as { error?: { code?: string; message?: string }; data?: unknown } & Record<string, unknown>;
  const code = body.error?.code;
  if (!res.ok || (code && code !== "ok")) {
    throw new Error(`TikTok: ${body.error?.message || (body as { error_description?: string }).error_description || code || res.status}`);
  }
  return body as T;
}

export function authorizeUrl(state: string, challenge: string, redirectUri: string) {
  const u = new URL("https://www.tiktok.com/v2/auth/authorize/");
  u.searchParams.set("client_key", creds().key);
  u.searchParams.set("scope", TIKTOK_SCOPES.join(","));
  u.searchParams.set("response_type", "code");
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("state", state);
  u.searchParams.set("code_challenge", challenge);
  u.searchParams.set("code_challenge_method", "S256");
  return u.toString();
}

type Token = { access_token: string; refresh_token: string; expires_in: number; open_id: string; scope: string };

async function tokenRequest(params: Record<string, string>): Promise<Token> {
  const { key, secret } = creds();
  const res = await fetch(`${API}/oauth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_key: key, client_secret: secret, ...params }),
  });
  const t = (await res.json()) as Token & { error?: string; error_description?: string };
  if (!res.ok || t.error) throw new Error(`TikTok: ${t.error_description || t.error || res.status}`);
  return t;
}

export const exchangeCode = (code: string, verifier: string, redirectUri: string) =>
  tokenRequest({ code, grant_type: "authorization_code", redirect_uri: redirectUri, code_verifier: verifier });

export async function userInfo(token: string) {
  const r = await tt<{ data: { user: { open_id: string; display_name: string; username?: string; avatar_url?: string } } }>(
    await fetch(`${API}/user/info/?fields=open_id,display_name,username,avatar_url`, { headers: { Authorization: `Bearer ${token}` } }));
  return r.data.user;
}

export type CreatorInfo = {
  creator_avatar_url: string; creator_username: string; creator_nickname: string;
  privacy_level_options: string[]; comment_disabled: boolean; duet_disabled: boolean; stitch_disabled: boolean;
  max_video_post_duration_sec: number;
};

export async function creatorInfo(token: string): Promise<CreatorInfo> {
  const r = await tt<{ data: CreatorInfo }>(await fetch(`${API}/post/publish/creator_info/query/`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8" },
  }));
  return r.data;
}

/** Upload the file to TikTok and wait briefly for it to finish processing. */
export async function directPost(token: string, videoUrl: string, caption: string, o: TikTokOptions) {
  const file = await fetch(videoUrl);
  if (!file.ok) throw new Error("Couldn't read the exported clip.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { chunkSize, count } = chunkPlan(bytes.length);
  const init = await tt<{ data: { publish_id: string; upload_url: string } }>(await fetch(`${API}/post/publish/video/init/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify({
      post_info: postInfo(caption, o),
      source_info: { source: "FILE_UPLOAD", video_size: bytes.length, chunk_size: chunkSize, total_chunk_count: count },
    }),
  }));
  for (let i = 0; i < count; i++) {
    const start = i * chunkSize;
    const end = i === count - 1 ? bytes.length : start + chunkSize;
    const up = await fetch(init.data.upload_url, {
      method: "PUT",
      headers: { "Content-Type": "video/mp4", "Content-Length": String(end - start), "Content-Range": `bytes ${start}-${end - 1}/${bytes.length}` },
      body: bytes.slice(start, end),
    });
    if (!up.ok && up.status !== 206 && up.status !== 201) throw new Error(`TikTok upload failed (${up.status}): ${await up.text()}`);
  }
  const id = init.data.publish_id;
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const s = await tt<{ data: { status: string; fail_reason?: string; publicaly_available_post_id?: (string | number)[] } }>(
      await fetch(`${API}/post/publish/status/fetch/`, {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8" },
        body: JSON.stringify({ publish_id: id }),
      }));
    if (s.data.status === "FAILED") throw new Error(`TikTok rejected the video: ${s.data.fail_reason ?? "unknown reason"}`);
    if (s.data.status === "PUBLISH_COMPLETE") {
      const pid = s.data.publicaly_available_post_id?.[0];
      return { externalId: pid ? String(pid) : id, url: null as string | null };
    }
  }
  // Still processing on TikTok's side; it finishes there on its own.
  return { externalId: id, url: null as string | null };
}

export const tiktokPublisher: Publisher = {
  async publish(job) {
    const o = (job.options ?? {}) as TikTokOptions;
    const caption = [job.caption, ...(job.hashtags ?? []).map((h) => (h.startsWith("#") ? h : `#${h}`))].join(" ").trim();
    const r = await directPost(job.token, job.videoUrl, caption, { ...o, privacy: (o.privacy || job.privacy || "SELF_ONLY") as TikTokOptions["privacy"] });
    const handle = job.handle;
    return { externalId: r.externalId, url: r.externalId && /^\d+$/.test(r.externalId) && handle ? `https://www.tiktok.com/@${handle}/video/${r.externalId}` : null };
  },
  async refresh(refreshToken) {
    const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
    return { accessToken: t.access_token, expiresAt: new Date(Date.now() + t.expires_in * 1000).toISOString(), refreshToken: t.refresh_token };
  },
};
