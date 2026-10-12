import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/**
 * Shared Engine event applier. The signed webhook route and the internal
 * clip pipeline both route through here, so every event is applied the
 * same way with the same idempotency (last_event_id on the touched row).
 */
type Db = SupabaseClient<Database>;
export type EngineEvent = { id: string; type: string; data?: Record<string, unknown> | null };
export type EventResult = "processed" | "ignored" | "duplicate";

const d = (ev: EngineEvent) => (ev.data ?? {}) as Record<string, unknown>;

async function audit(db: Db, ownerId: string | null, action: string, entity: string, entityId: string, details: unknown) {
  await db.from("audit_logs").insert({
    ...(ownerId ? { owner_id: ownerId, user_id: ownerId } : {}),
    action, entity, entity_id: entityId, details: (details ?? {}) as never, timestamp: new Date().toISOString(),
  });
}

async function notify(db: Db, userId: string, type: string, title: string, body: string, link: string) {
  await db.from("notifications").insert({ owner_id: userId, user_id: userId, type, title, body, link, read: false });
}

export async function applyEngineEvent(db: Db, ev: EngineEvent): Promise<EventResult> {
  if (!ev.id || !ev.type) return "ignored";
  const data = d(ev);

  if (ev.type === "test.ping") {
    await audit(db, null, "engine.test_ping", "engine", ev.id, data);
    return "processed";
  }

  if (ev.type === "autoclip.awaiting_confirmation") {
    const job = (await db.from("clip_jobs").select("*").eq("engine_job_id", String(data["autoclip_id"] ?? "")).maybeSingle()).data;
    if (!job) return "ignored";
    if (job.last_event_id === ev.id) return "duplicate";
    const suggested = typeof data["suggested_count"] === "number" ? data["suggested_count"] : null;
    await db.from("clip_jobs").update({ status: "AWAITING_CONFIRMATION", suggested_count: suggested, stage: null, last_event_id: ev.id }).eq("id", job.id);
    await notify(db, job.owner_id, "CLIPS_AWAITING_COUNT", "Clips need your count",
      `AI suggests ${suggested ?? "a few"} clips for ${String(data["source_name"] ?? "your video")}. Accept or change the number.`,
      "/clips");
    await audit(db, job.owner_id, "engine.autoclip.awaiting_confirmation", "clip_jobs", job.id, { suggested_count: suggested, event_id: ev.id });
    return "processed";
  }

  if (ev.type === "autoclip.completed") {
    const job = (await db.from("clip_jobs").select("*").eq("engine_job_id", String(data["autoclip_id"] ?? "")).maybeSingle()).data;
    if (!job) return "ignored";
    if (job.last_event_id === ev.id) return "duplicate";
    await db.from("clip_jobs").update({
      status: "COMPLETED", progress: 100, stage: null,
      processing_seconds: typeof data["processing_seconds"] === "number" ? Math.round(data["processing_seconds"]) : job.processing_seconds,
      last_event_id: ev.id,
    }).eq("id", job.id);
    let firstLayout: string | null = null;
    if (job.formats && typeof job.formats === "object" && Array.isArray((job.formats as { layouts?: unknown }).layouts)) {
      firstLayout = String(((job.formats as { layouts: unknown[] }).layouts)[0] ?? "") || null;
    }
    const clips = Array.isArray(data["clips"]) ? data["clips"] : [];
    let inserted = 0;
    for (const [i, raw] of clips.entries()) {
      const c = (raw ?? {}) as Record<string, unknown>;
      const ins = await db.from("clips").insert({
        owner_id: job.owner_id, created_by: job.created_by, job_id: job.id, source_asset_id: job.source_asset_id,
        engine_project_id: typeof c["project_id"] === "string" ? c["project_id"] : null,
        index: typeof c["index"] === "number" ? c["index"] : i + 1,
        title: typeof c["title"] === "string" ? c["title"] : null,
        start_ms: typeof c["start_ms"] === "number" ? Math.round(c["start_ms"]) : null,
        end_ms: typeof c["end_ms"] === "number" ? Math.round(c["end_ms"]) : null,
        duration_ms: typeof c["duration_ms"] === "number" ? Math.round(c["duration_ms"]) : null,
        thumbnail_url: typeof c["thumbnail_url"] === "string" ? c["thumbnail_url"] : null,
        score: typeof c["score"] === "number" ? c["score"] : null,
        score_breakdown: (c["score_breakdown"] ?? c["grades"] ?? null) as never,
        scene_analysis: typeof c["scene_analysis"] === "string" ? c["scene_analysis"] : null,
        reason: typeof c["reason"] === "string" ? c["reason"] : null,
        alternate_of: typeof c["alternate_of"] === "string" ? c["alternate_of"] : null,
        aspect: job.aspect, layout: firstLayout, status: "FOUND", last_event_id: ev.id,
      });
      if (!ins.error) inserted++;
    }
    await notify(db, job.owner_id, "CLIPS_READY", "Clips are ready",
      `${inserted} clip${inserted === 1 ? "" : "s"} from ${String(data["source_name"] ?? "your video")} are waiting in Review.`, "/review");
    await audit(db, job.owner_id, "engine.autoclip.completed", "clip_jobs", job.id, { clips: inserted, event_id: ev.id });
    return "processed";
  }

  if (ev.type === "autoclip.failed") {
    const job = (await db.from("clip_jobs").select("*").eq("engine_job_id", String(data["autoclip_id"] ?? "")).maybeSingle()).data;
    if (!job) return "ignored";
    if (job.last_event_id === ev.id) return "duplicate";
    await db.from("clip_jobs").update({ status: "FAILED", error: String(data["error"] ?? "The clip job failed"), stage: null, last_event_id: ev.id }).eq("id", job.id);
    await notify(db, job.created_by, "JOB_FAILED", "Clip job failed", String(data["error"] ?? "The clip job failed"), `/review?job=${job.id}`);
    await audit(db, job.owner_id, "engine.autoclip.failed", "clip_jobs", job.id, { error: data["error"] ?? null, event_id: ev.id });
    return "processed";
  }

  if (ev.type === "asset.imported" || ev.type === "asset.failed") {
    const row = (await db.from("source_assets").select("*").eq("engine_asset_id", String(data["asset_id"] ?? "")).maybeSingle()).data;
    if (!row) return "ignored";
    if (ev.type === "asset.failed") {
      await db.from("source_assets").update({ status: "FAILED", error: String(data["error"] ?? "Import failed") }).eq("id", row.id);
    } else {
      await db.from("source_assets").update({
        status: "READY", error: null,
        public_url: typeof data["url"] === "string" ? data["url"] : row.public_url,
        duration_ms: typeof data["length_ms"] === "number" ? Math.round(data["length_ms"]) : row.duration_ms,
        size_bytes: typeof data["size_bytes"] === "number" ? Math.round(data["size_bytes"]) : row.size_bytes,
        thumbnail_url: typeof data["thumbnail_url"] === "string" ? data["thumbnail_url"] : row.thumbnail_url,
      }).eq("id", row.id);
    }
    await audit(db, row.owner_id, `engine.${ev.type}`, "source_assets", row.id, { event_id: ev.id });
    return "processed";
  }

  if (ev.type === "export.completed" || ev.type === "export.failed") {
    const clip = (await db.from("clips").select("*").eq("engine_export_id", String(data["export_id"] ?? "")).maybeSingle()).data;
    if (!clip) return "ignored";
    if (clip.last_event_id === ev.id) return "duplicate";
    const link = clip.job_id ? `/review?job=${clip.job_id}` : "/review";
    const people = [...new Set([clip.created_by, clip.assignee].filter(Boolean) as string[])];
    if (ev.type === "export.failed") {
      await db.from("clips").update({ status: "FAILED", error: String(data["error"] ?? "Export failed"), last_event_id: ev.id }).eq("id", clip.id);
      for (const u of people) await db.from("notifications").insert({ owner_id: clip.owner_id, user_id: u, type: "EXPORT_FAILED", title: "Export failed", body: `${clip.title ?? "A clip"}: ${String(data["error"] ?? "Export failed")}`, link, read: false });
    } else {
      const a = (data["asset"] ?? {}) as Record<string, unknown>;
      const num = (k: string) => (typeof a[k] === "number" ? Math.round(a[k] as number) : null);
      const url = typeof a["url"] === "string" ? a["url"] : null;
      const edits = { ...((clip.edits as object | null) ?? {}), exported: { start_ms: clip.start_ms, end_ms: clip.end_ms } };
      await db.from("clips").update({
        status: "READY", video_url: url, width: num("width"), height: num("height"), size_bytes: num("size"),
        duration_ms: typeof a["length"] === "number" ? Math.round((a["length"] as number) * 1000) : clip.duration_ms,
        thumbnail_url: typeof a["thumbnail_url"] === "string" ? a["thumbnail_url"] : clip.thumbnail_url, error: null, edits: edits as never, last_event_id: ev.id,
      }).eq("id", clip.id);
      await db.from("assets").insert({ owner_id: clip.owner_id, created_by: clip.created_by, type: "VIDEO", source: "EXPORT", name: clip.title ?? "Clip", url, size_bytes: num("size"), duration_ms: typeof a["length"] === "number" ? Math.round((a["length"] as number) * 1000) : null, status: "READY", tags: [] as never });
      for (const u of people) await db.from("notifications").insert({ owner_id: clip.owner_id, user_id: u, type: "EXPORT_READY", title: "Clip exported", body: `${clip.title ?? "A clip"} is ready to download.`, link, read: false });
    }
    await audit(db, clip.owner_id, `engine.${ev.type}`, "clips", clip.id, { event_id: ev.id });
    return "processed";
  }

  // transcript.completed / render.* / dub.* / enhance.* are handled by later build-pack steps.
  return "ignored";
}
