import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { Platform } from "./finish-rules";

/**
 * Taking a queued post and actually putting it on a platform.
 *
 * Everything here is the part that is the same whichever platform it is:
 * which posts are due, whose turn it is, what a valid token is, what happens
 * when an upload fails at three in the morning. The platform-specific half —
 * the upload itself — is a `Publisher`, and none are registered yet: the
 * developer apps have to exist and be approved before a single byte can be
 * sent anywhere.
 *
 * Until one is registered this driver is deliberately inert. A post for a
 * platform it cannot publish to is left exactly where it is, queued, for the
 * manual flow to handle — which is what happens today and works. Nothing is
 * failed for want of a feature that was never switched on.
 */

export type PublishJob = {
  postId: string;
  platform: Platform;
  caption: string;
  title: string | null;
  hashtags: string[];
  privacy: string | null;
  /** A URL the platform can fetch the finished clip from, signed and public. */
  videoUrl: string;
  /** A live token for the account being posted to. */
  token: string;
  externalAccountId: string | null;
};

export type PublishResult = { externalId: string; url: string | null };

export type Publisher = {
  /** Put the clip on the platform. Throw to fail the attempt. */
  publish(job: PublishJob): Promise<PublishResult>;
  /** Swap a refresh token for a fresh access token, if the platform expires them. */
  refresh?(refreshToken: string): Promise<{ accessToken: string; expiresAt: string | null }>;
};

/**
 * Registered uploaders. Empty on purpose.
 *
 * TikTok needs an audited app before a post can be anything but private;
 * Instagram needs a Business account on a Facebook Page. Writing the upload
 * before those exist would mean shipping code nobody could run, so each is
 * added when its credentials are.
 */
export const PUBLISHERS: Partial<Record<Platform, Publisher>> = {};

/** Waits between attempts. Four tries over about half an hour, then it stops. */
export const BACKOFF_MINUTES = [1, 5, 25];

type PostRow = {
  id: string; platform: string; caption: string; title: string | null;
  hashtags: unknown; privacy: string | null; attempts: number | null;
  clip_id: string; channel_id: string;
  clips: { video_url: string | null } | null;
  channels: { status: string; external_account_id: string | null } | null;
};

/** A token for this channel, refreshed first if the platform expires them. */
export async function tokenFor(
  db: SupabaseClient<Database>,
  channelId: string,
  publisher: Publisher,
): Promise<string> {
  const cred = (await db.from("channel_credentials").select("*").eq("channel_id", channelId)
    .maybeSingle()).data;
  if (!cred?.access_token) throw new Error("This channel is not connected yet — reconnect it on the Posts tab.");
  const expires = cred.expires_at ? Date.parse(cred.expires_at) : NaN;
  // A token about to expire mid-upload is the same problem as an expired one,
  // so treat the last minute of its life as already gone.
  const stale = Number.isFinite(expires) && expires - Date.now() < 60_000;
  if (!stale || !publisher.refresh || !cred.refresh_token) return cred.access_token;
  const fresh = await publisher.refresh(cred.refresh_token);
  await db.from("channel_credentials")
    .update({ access_token: fresh.accessToken, expires_at: fresh.expiresAt })
    .eq("channel_id", channelId);
  return fresh.accessToken;
}

/**
 * Publish the posts that are due. Returns how many were moved on.
 *
 * Called on a schedule. One post at a time per call so a platform that is
 * slow or rate-limiting cannot hold up the rest.
 */
export async function publishDuePosts(db: SupabaseClient<Database>, limit = 5): Promise<number> {
  const { data } = await db.from("posts")
    .select("*,clips(video_url),channels(status,external_account_id)")
    .eq("status", "QUEUED")
    .eq("mode", "AUTO")
    .lte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(limit);

  let moved = 0;
  for (const post of (data ?? []) as unknown as PostRow[]) {
    const publisher = PUBLISHERS[post.platform as Platform];
    // No uploader for this platform, or the account was never connected:
    // leave it queued for the manual flow rather than failing it.
    if (!publisher || post.channels?.status !== "CONNECTED") continue;
    if (!post.clips?.video_url) {
      await fail(db, post, "This clip has not been exported yet.");
      moved++;
      continue;
    }
    try {
      const token = await tokenFor(db, post.channel_id, publisher);
      const result = await publisher.publish({
        postId: post.id,
        platform: post.platform as Platform,
        caption: post.caption,
        title: post.title,
        hashtags: Array.isArray(post.hashtags) ? (post.hashtags as string[]) : [],
        privacy: post.privacy,
        videoUrl: post.clips.video_url,
        token,
        externalAccountId: post.channels.external_account_id,
      });
      await db.from("posts").update({
        status: "POSTED", external_post_id: result.externalId, post_url: result.url,
        posted_at: new Date().toISOString(), last_error: null,
      }).eq("id", post.id);
      moved++;
    } catch (e) {
      await fail(db, post, e instanceof Error ? e.message : "The upload failed");
      moved++;
    }
  }
  return moved;
}

/**
 * A failed attempt waits and tries again; a post that has used up its tries
 * stops and says why, so it can be posted by hand instead of retrying
 * forever against a platform that is refusing it.
 */
async function fail(db: SupabaseClient<Database>, post: PostRow, message: string) {
  const attempts = (post.attempts ?? 0) + 1;
  const wait = BACKOFF_MINUTES[attempts - 1];
  const patch = wait === undefined
    ? { status: "FAILED", attempts, last_error: message }
    : {
        status: "QUEUED", attempts, last_error: message,
        scheduled_at: new Date(Date.now() + wait * 60_000).toISOString(),
      };
  await db.from("posts").update(patch).eq("id", post.id);
}
