import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { applyEngineEvent, type EngineEvent } from "./engine-events.server";
import { engineClient } from "./engine.server";
import type { ClipLength } from "./clip-rules";

/**
 * Driving the crayZmundo Engine — the part of crayZmundo that actually cuts
 * video. Jobs are submitted here and the Engine does the work; completion
 * normally arrives by signed webhook, and this poll is the fallback for when
 * the Engine cannot reach us (local development, or a webhook that was lost).
 * Both routes end in applyEngineEvent, so the result is identical either way.
 */
type Db = SupabaseClient<Database>;

type JobRow = {
  id: string; owner_id: string; created_by: string; engine_job_id: string | null;
  status: string; stage: string | null; progress: number | null;
  clip_count: unknown; clip_length: unknown; coverage: string; suggested_count: number | null;
  range_start_ms: number | null; range_end_ms: number | null;
  genre: string | null; mode: string; prompt: string | null; must_include: unknown;
  headline_top_n: number | null; alternates: boolean | null; edit_level: string | null;
  aspect: string; framing: string | null; language: string | null;
  source_asset_id: string; formats: unknown; created_at: string;
  caption_style_id: string | null;
  source_assets: { name: string; engine_asset_id: string | null } | null;
};

type EngineJob = {
  id: string; status: string; stage: string | null; progress: number;
  suggested_count: number | null; processing_s: number; error: string | null;
  clips: Record<string, unknown>[];
};

/** The Engine speaks lower case; the app's columns are upper case. */
const STATUS: Record<string, string> = {
  queued: "QUEUED",
  processing: "PROCESSING",
  awaiting_confirmation: "AWAITING_CONFIRMATION",
  completed: "COMPLETED",
  failed: "FAILED",
};
const STAGE: Record<string, string> = {
  importing: "IMPORTING", transcribing: "TRANSCRIBING", finding: "FINDING",
  framing: "FRAMING", building: "BUILDING", finalizing: "BUILDING",
};

const LAYOUT: Record<string, string> = {
  full_video: "full-video", streamer: "streamer", split: "split",
  black_box: "black-box", title_subtitles: "title-subtitles",
  two_up: "split", three_up: "split", four_up: "split", screenshare: "full-video",
};

function lengthSeconds(cl: unknown): number | "auto" | { min_s: number; max_s: number } {
  const v = cl as ClipLength | null;
  if (v == null || v === "auto") return "auto";
  if (typeof v === "number") return v;
  if (typeof v === "object" && "min_s" in v) return { min_s: v.min_s, max_s: v.max_s };
  return "auto";
}

/** Everything the Engine needs to cut this job, from the row the app stored. */
function requestFor(job: JobRow, engineAssetId: string) {
  const formats = (job.formats ?? {}) as { layouts?: string[] };
  const layouts = (formats.layouts ?? ["streamer"]).map((l) => LAYOUT[l] ?? "full-video");
  return {
    asset_id: engineAssetId,
    coverage: job.coverage === "WHOLE_VIDEO" ? "whole" : job.coverage === "DONT_CLIP" ? "single" : "best",
    clip_count: typeof job.clip_count === "number" ? job.clip_count : "auto",
    clip_length: lengthSeconds(job.clip_length),
    range_start_ms: job.range_start_ms,
    range_end_ms: job.range_end_ms,
    genre: (job.genre ?? "Auto").toLowerCase() === "auto" ? "auto" : job.genre,
    mode: (job.mode ?? "AUTO").toLowerCase(),
    prompt: job.prompt ?? "",
    must_include: Array.isArray(job.must_include) ? (job.must_include as string[]) : [],
    headline_top_n: job.headline_top_n ?? 0,
    alternates: !!job.alternates,
    confirm_count: job.clip_count === "auto",
    edit_level: job.edit_level === "clips" ? "cuts_only" : (job.edit_level ?? "full"),
    aspect: job.aspect,
    formats: [...new Set(layouts)].slice(0, 5),
    framing: (job.framing ?? "AUTO").toLowerCase(),
    language: job.language && job.language !== "auto" ? job.language : null,
    caption_style_id: job.caption_style_id || "bold_white",
  };
}

async function failJob(db: Db, job: JobRow, message: string) {
  await db.from("clip_jobs").update({ status: "FAILED", stage: null, error: message }).eq("id", job.id);
  await db.from("notifications").insert({
    owner_id: job.owner_id, user_id: job.created_by, type: "JOB_FAILED",
    title: "Clip job failed", body: message, link: `/review?job=${job.id}`, read: false,
  });
}

/** Hand a queued job to the Engine. */
async function submit(db: Db, job: JobRow): Promise<boolean> {
  const engineAssetId = job.source_assets?.engine_asset_id;
  if (!engineAssetId) {
    await failJob(db, job,
      "This source was not uploaded through the Engine, so it cannot be clipped. Re-upload it from the Library.");
    return true;
  }
  const r = await engineClient<{ id: string; status: string }>(
    "POST", "/v1/autoclip", requestFor(job, engineAssetId));
  if (!r.ok) {
    // A missing Engine is a setup problem, not a broken job: leave it queued.
    if (r.error.code === "ENGINE_NOT_CONFIGURED" || r.error.code === "ENGINE_UNREACHABLE") return false;
    await failJob(db, job, r.error.message);
    return true;
  }
  await db.from("clip_jobs").update({
    engine_job_id: r.data.id,
    status: STATUS[r.data.status] ?? "PROCESSING",
    stage: "TRANSCRIBING",
    progress: 5,
    error: null,
  }).eq("id", job.id);
  return true;
}

/** Ask the Engine how a submitted job is going, and apply the result. */
async function poll(db: Db, job: JobRow): Promise<boolean> {
  const r = await engineClient<EngineJob>("GET", `/v1/autoclip/${encodeURIComponent(job.engine_job_id!)}`);
  if (!r.ok) return false;
  const e = r.data;

  if (e.status === "completed") {
    const ev: EngineEvent = {
      id: `poll_${e.id}_completed`,
      type: "autoclip.completed",
      data: {
        autoclip_id: e.id,
        source_name: job.source_assets?.name ?? "your video",
        processing_seconds: Math.round(e.processing_s ?? 0),
        clips: e.clips,
      },
    };
    return (await applyEngineEvent(db, ev)) === "processed";
  }
  if (e.status === "failed") {
    const ev: EngineEvent = {
      id: `poll_${e.id}_failed`,
      type: "autoclip.failed",
      data: { autoclip_id: e.id, error: e.error ?? "The clip job failed" },
    };
    return (await applyEngineEvent(db, ev)) === "processed";
  }
  if (e.status === "awaiting_confirmation") {
    const ev: EngineEvent = {
      id: `poll_${e.id}_awaiting`,
      type: "autoclip.awaiting_confirmation",
      data: {
        autoclip_id: e.id,
        suggested_count: e.suggested_count,
        source_name: job.source_assets?.name ?? "your video",
      },
    };
    return (await applyEngineEvent(db, ev)) === "processed";
  }

  // still running: mirror the stage so the creator sees real progress
  const stage = STAGE[e.stage ?? ""] ?? job.stage;
  const status = STATUS[e.status] ?? "PROCESSING";
  if (stage === job.stage && status === job.status && e.progress === job.progress) return false;
  await db.from("clip_jobs").update({ status, stage, progress: e.progress }).eq("id", job.id);
  return true;
}

/** Advances up to `limit` active jobs. Returns how many changed. */
export async function advanceActiveJobs(db: Db, limit = 3): Promise<number> {
  const { data } = await db.from("clip_jobs")
    .select("*,source_assets(name,engine_asset_id)")
    .in("status", ["QUEUED", "PROCESSING", "AWAITING_CONFIRMATION"])
    .order("created_at", { ascending: true })
    .limit(limit);
  const jobs = (data ?? []) as unknown as JobRow[];

  let changed = 0;
  for (const job of jobs) {
    try {
      const moved = job.engine_job_id ? await poll(db, job) : await submit(db, job);
      if (moved) changed++;
    } catch (e) {
      await failJob(db, job, e instanceof Error ? e.message : "The clip job failed");
      changed++;
    }
  }
  return changed;
}
