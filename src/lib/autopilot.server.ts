import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { COPY_LIMITS, type Platform } from "./finish-rules";

/**
 * Autopilot — what happens after you press Get clips.
 *
 * A job started from the dashboard carries { autopilot: true }. From then on
 * the work runs itself: the AI picks the clip count, approves the clips that
 * clear the bar, renders them on the Engine, writes the copy for each channel
 * and queues the posts on a drip. You only step in to change something.
 *
 * Every step here is safe to run twice: the webhook that triggers it can
 * arrive more than once.
 */

type Db = SupabaseClient<Database>;

/** A clip has to be at least this good before autopilot sends it on unseen. */
export const AUTO_APPROVE_SCORE = 60;
/** Most clips a single job will send on by itself. */
export const AUTO_APPROVE_MAX = 30;
/** Minutes between automatic posts, so a batch does not land all at once. */
export const AUTO_POST_GAP_MINUTES = 90;
/** The first automatic post goes out no sooner than this. */
export const AUTO_POST_LEAD_MINUTES = 15;

type Json = Record<string, unknown>;
const obj = (v: unknown): Json =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {};

/** True when this job was started with autopilot on. */
export function isAutopilot(edits: unknown): boolean {
  return obj(edits)["autopilot"] === true;
}

/**
 * A job finished and its clips are in. Approve the ones that clear the bar and
 * send them to the Engine to render. Returns how many started.
 */
export async function autoExportJobClips(
  db: Db,
  job: { id: string; edits: unknown },
): Promise<number> {
  if (!isAutopilot(job.edits)) return 0;
  const found =
    (
      await db
        .from("clips")
        .select("id,score,engine_project_id")
        .eq("job_id", job.id)
        .eq("status", "FOUND")
    ).data ?? [];
  const good = found
    .filter((c) => (c.score ?? 0) >= AUTO_APPROVE_SCORE && !!c.engine_project_id)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, AUTO_APPROVE_MAX);
  if (!good.length) return 0;
  const ids = good.map((c) => c.id);
  const claimed = await db.from("clips").update({ status: "APPROVED" })
    .in("id", ids).eq("status", "FOUND").select("id");
  const claimedIds = claimed.data?.map((clip) => clip.id) ?? [];
  if (!claimedIds.length) return 0;
  const { exportClipsOnEngine } = await import("./export.server");
  const r = await exportClipsOnEngine(db, claimedIds, "HD");
  return r.started.length;
}

/** Plain copy to fall back on when the AI is unavailable. A queued post beats a stalled one. */
function plainCopy(title: string | null, handle: string | null, p: Platform): string {
  const line = (title ?? "").trim() || "New clip";
  const follow = handle ? `\n\nFollow ${handle}` : "";
  const tags = p === "X" ? "" : "\n\n#shorts #clips";
  return `${line}${follow}${tags}`.slice(0, COPY_LIMITS[p]);
}

/**
 * A clip finished rendering. Write the copy for each channel and queue a post
 * to every one of them, spaced out so they do not all fire together.
 */
export async function autoQueueClip(
  db: Db,
  clip: {
    id: string;
    owner_id: string;
    created_by: string;
    job_id: string | null;
    title: string | null;
    watermark_text: string | null;
    copy: unknown;
  },
): Promise<number> {
  const job = clip.job_id
    ? (await db.from("clip_jobs").select("edits").eq("id", clip.job_id).maybeSingle()).data
    : null;
  if (!job || !isAutopilot(job.edits)) return 0;

  // Already queued once — the webhook can arrive twice.
  const seen = (await db.from("posts").select("id").eq("clip_id", clip.id).limit(1)).data ?? [];
  if (seen.length) return 0;

  const channels =
    (await db.from("channels").select("id,platform,status").eq("owner_id", clip.owner_id)).data ??
    [];
  if (!channels.length) return 0;
  const platforms = [...new Set(channels.map((c) => c.platform as Platform))];

  // Ask the AI for the copy; fall back to a plain caption rather than stall.
  let copy = obj(clip.copy) as Record<string, string>;
  const missing = platforms.filter((p) => typeof copy[p] !== "string");
  if (missing.length) {
    try {
      const { writeCopyFor } = await import("./posts.functions");
      copy = { ...copy, ...(await writeCopyFor(db, clip.id, missing)) };
    } catch {
      /* the gateway is down or out of credit — the plain caption below covers it */
    }
  }

  // Start after everything already waiting, so a day's clips drip out.
  const last = (
    await db
      .from("posts")
      .select("scheduled_at")
      .eq("owner_id", clip.owner_id)
      .not("scheduled_at", "is", null)
      .order("scheduled_at", { ascending: false })
      .limit(1)
  ).data?.[0];
  const lead = Date.now() + AUTO_POST_LEAD_MINUTES * 60_000;
  const after = last?.scheduled_at
    ? new Date(last.scheduled_at).getTime() + AUTO_POST_GAP_MINUTES * 60_000
    : 0;
  const when = new Date(Math.max(lead, after)).toISOString();

  const rows = channels.map((ch) => {
    const p = ch.platform as Platform;
    const text =
      typeof copy[p] === "string" && copy[p]!.trim()
        ? copy[p]!.slice(0, COPY_LIMITS[p])
        : plainCopy(clip.title, clip.watermark_text, p);
    return {
      clip_id: clip.id,
      channel_id: ch.id,
      platform: ch.platform,
      caption: text,
      title: p === "YOUTUBE" ? `${(clip.title ?? "Clip").slice(0, 90)} #Shorts` : null,
      hashtags: [] as never,
      scheduled_at: when,
      mode: ch.status === "CONNECTED" ? "AUTO" : "MANUAL",
      status: "QUEUED",
      created_by: clip.created_by,
      owner_id: clip.owner_id,
    };
  });
  const ins = await db.from("posts").insert(rows);
  return ins.error ? 0 : rows.length;
}
