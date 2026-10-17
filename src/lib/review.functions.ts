import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { sign, editsOf, must } from "./review-helpers";
import { EXPORT_SIZES, EXPORT_STALE_MS, STORAGE_PREFIX, makeShareToken, mergeIssue, mergeSegments, shareTokenValid, trimIssue } from "./review-rules";

export const reviewData = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const db = context.supabase;
  // Fallback: an export left EXPORTING past the stale window (browser closed mid-render) is marked failed.
  const stale = must(await db.from("clips").select("id,edits").eq("status", "EXPORTING"));
  for (const c of stale) {
    const at = editsOf(c.edits).export_started_at;
    if (at && Date.now() - new Date(at).getTime() > EXPORT_STALE_MS * 15) await db.from("clips").update({ status: "FAILED", error: "The export was interrupted before it finished. Export again." }).eq("id", c.id);
  }
  const [clips, jobs, sources, members] = await Promise.all([
    db.from("clips").select("*").order("created_at", { ascending: false }),
    db.from("clip_jobs").select("id,status,created_at,aspect,source_asset_id").order("created_at", { ascending: false }),
    db.from("source_assets").select("id,name,duration_ms,fps,width,height,transcript,public_url,thumbnail_url"),
    db.from("team_logins").select("user_id,name"),
  ]);
  const me = (await db.from("profiles").select("display_name").eq("id", context.userId).maybeSingle()).data;
  const srcs = await Promise.all(must(sources).map(async (s) => ({ ...s, playUrl: await sign(db, s.public_url), thumbnail_url: await sign(db, s.thumbnail_url) })));
  const list = await Promise.all(must(clips).map(async (c) => ({ ...c, video_url: await sign(db, c.video_url), thumbnail_url: await sign(db, c.thumbnail_url) })));
  const people = [{ user_id: context.userId, name: me?.display_name || "Me" }, ...must(members).filter((m) => m.user_id !== context.userId)];
  return { clips: list, jobs: must(jobs), sources: srcs, members: people, me: context.userId };
});

export const updateClip = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid(), title: z.string().trim().min(1).max(200).optional(), favorite: z.boolean().optional(), disliked: z.boolean().optional(), assignee: z.string().uuid().nullable().optional() }))
  .handler(async ({ context, data }) => {
    const { id, ...rest } = data;
    const fields = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)) as { title?: string; favorite?: boolean; disliked?: boolean; assignee?: string | null };
    must(await context.supabase.from("clips").update(fields).eq("id", id).select("id").single());
    // Dislikes are the finder feedback: the clip engine reads disliked clips when it picks the next moments.
    return true;
  });

export const setClipStatus = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ ids: z.array(z.string().uuid()).min(1).max(200), status: z.enum(["APPROVED", "REJECTED", "FOUND"]) }))
  .handler(async ({ context, data }) => {
    const patch = data.status === "REJECTED" ? { status: data.status, engine_project_id: null } : { status: data.status };
    must(await context.supabase.from("clips").update(patch).in("id", data.ids).not("status", "in", "(EXPORTING)"));
    return true;
  });

export const trimClip = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid(), start_ms: z.number().int().min(0), end_ms: z.number().int().positive() }))
  .handler(async ({ context, data }) => {
    const db = context.supabase;
    const c = must(await db.from("clips").select("start_ms,end_ms,edits,source_asset_id,source_assets(duration_ms)").eq("id", data.id).single());
    const e = editsOf(c.edits);
    const found = e.found ?? { start_ms: c.start_ms ?? 0, end_ms: c.end_ms ?? 0 };
    const bad = trimIssue(data.start_ms, data.end_ms, found, (c.source_assets as { duration_ms: number | null } | null)?.duration_ms);
    if (bad) throw new Error(bad);
    must(await db.from("clips").update({ start_ms: data.start_ms, end_ms: data.end_ms, duration_ms: data.end_ms - data.start_ms, edits: { ...e, found, trimmed: true, segments: undefined } as never }).eq("id", data.id).select("id").single());
    return true;
  });

export const duplicateClip = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    const c = must(await context.supabase.from("clips").select("*").eq("id", data.id).single());
    const { id: _i, created_at: _c, owner_id: _o, created_by: _b, share_token: _s, engine_export_id: _x, video_url: _v, width: _w, height: _h, size_bytes: _z, resolution: _r, ...rest } = c;
    const e = editsOf(c.edits);
    const ins = must(await context.supabase.from("clips").insert({ ...rest, created_by: context.userId, owner_id: context.userId, status: "FOUND", title: `${c.title ?? "Clip"} (copy)`, engine_project_id: `${c.engine_project_id ?? "proj"}_copy_${Date.now().toString(36)}`, thumbnail_url: c.video_url ? null : c.thumbnail_url, edits: { ...e, exported: undefined, export_started_at: undefined } as never, error: null }).select("id").single());
    return ins.id;
  });

export const mergeClips = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ ids: z.array(z.string().uuid()).min(2).max(20) }))
  .handler(async ({ context, data }) => {
    const rows = must(await context.supabase.from("clips").select("*").in("id", data.ids));
    const bad = mergeIssue(rows); if (bad) throw new Error(bad);
    const segs = mergeSegments(rows);
    const first = [...rows].sort((a, b) => (a.start_ms ?? 0) - (b.start_ms ?? 0))[0]!;
    const total = segs.reduce((n, s) => n + (s.end_ms - s.start_ms), 0);
    const ins = must(await context.supabase.from("clips").insert({
      owner_id: context.userId, created_by: context.userId, job_id: first.job_id, source_asset_id: first.source_asset_id,
      engine_project_id: `proj_merge_${Date.now().toString(36)}`, title: `Merged: ${rows.map((r) => r.title ?? "Clip").join(" + ")}`.slice(0, 200),
      start_ms: segs[0]!.start_ms, end_ms: segs[segs.length - 1]!.end_ms, duration_ms: total, score: Math.max(...rows.map((r) => r.score ?? 0)),
      reason: "Merged from selected clips.", aspect: first.aspect, thumbnail_url: first.thumbnail_url, status: "FOUND", edits: { segments: segs } as never,
    }).select("id").single());
    return ins.id;
  });

/** engineExport: only APPROVED clips (or READY ones being re-exported). Renders run in the browser. */
export const startExport = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ ids: z.array(z.string().uuid()).min(1).max(100), resolution: z.enum(["HD", "UHD"]) }))
  .handler(async ({ context, data }) => {
    const db = context.supabase;
    const rows = must(await db.from("clips").select("id,status,start_ms,end_ms,aspect,edits,title,source_asset_id,source_assets(public_url,name)").in("id", data.ids).in("status", ["APPROVED", "READY"]));
    const out = [];
    for (const c of rows) {
      const src = c.source_assets as { public_url: string | null; name: string } | null;
      if (!src?.public_url) { await db.from("clips").update({ status: "FAILED", error: "The source video file isn't stored in the app, so it can't be rendered." }).eq("id", c.id); continue; }
      const exportId = `exp_${crypto.randomUUID()}`;
      const e = editsOf(c.edits);
      await db.from("clips").update({ status: "EXPORTING", engine_export_id: exportId, resolution: data.resolution, error: null, edits: { ...e, finish_dirty: undefined, export_started_at: new Date().toISOString() } as never }).eq("id", c.id);
      out.push({ clipId: c.id, exportId, title: c.title ?? "clip", aspect: c.aspect, sourceUrl: await sign(db, src.public_url), segments: e.segments ?? [{ start_ms: c.start_ms ?? 0, end_ms: c.end_ms ?? 0 }], size: EXPORT_SIZES[data.resolution] });
    }
    return { workspace: (await db.rpc("workspace_of", { _uid: context.userId })).data as string, jobs: out };
  });

export const finishExport = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(z.object({ exportId: z.string().min(5).max(80), path: z.string().max(400).nullable(), thumbPath: z.string().max(400).nullable(), width: z.number().int().nullable(), height: z.number().int().nullable(), size: z.number().int().nullable(), lengthSec: z.number().nullable(), error: z.string().max(500).optional() }))
  .handler(async ({ context, data }) => {
    const { applyEngineEvent } = await import("./engine-events.server");
    const ev = data.error || !data.path
      ? { id: `evt_${data.exportId}_failed`, type: "export.failed", data: { export_id: data.exportId, error: data.error ?? "Render failed" } }
      : { id: `evt_${data.exportId}_done`, type: "export.completed", data: { export_id: data.exportId, asset: { url: STORAGE_PREFIX + data.path, size: data.size, length: data.lengthSec, width: data.width, height: data.height, thumbnail_url: data.thumbPath ? STORAGE_PREFIX + data.thumbPath : null } } };
    return applyEngineEvent(context.supabase, ev);
  });

export const shareJob = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ jobId: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    const bytes = crypto.getRandomValues(new Uint8Array(18));
    const token = makeShareToken(btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""));
    must(await context.supabase.from("clips").update({ share_token: token }).eq("job_id", data.jobId).neq("status", "REJECTED"));
    return token;
  });

export const listNotifications = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) =>
  must(await context.supabase.from("notifications").select("*").eq("user_id", context.userId).order("created_at", { ascending: false }).limit(30)));

export const markNotification = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid().nullable() }))
  .handler(async ({ context, data }) => {
    let q = context.supabase.from("notifications").update({ read: true }).eq("user_id", context.userId);
    if (data.id) q = q.eq("id", data.id);
    must(await q); return true;
  });

/** Public share page: token checked server-side, only titles/previews returned. */
export const getShared = createServerFn({ method: "GET" })
  .inputValidator(z.object({ token: z.string().max(200) }))
  .handler(async ({ data }) => {
    if (!shareTokenValid(data.token)) return { ok: false as const, clips: [] };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const rows = must(await supabaseAdmin.from("clips").select("id,title,status,start_ms,end_ms,video_url,thumbnail_url,edits,source_assets(public_url)").eq("share_token", data.token).order("index"));
    const clips = await Promise.all(rows.map(async (c) => ({
      id: c.id, title: c.title, status: c.status, start_ms: c.start_ms, end_ms: c.end_ms, feedback: editsOf(c.edits).client_feedback ?? null,
      video: (await sign(supabaseAdmin, c.video_url)) ?? (await sign(supabaseAdmin, (c.source_assets as { public_url: string | null } | null)?.public_url)),
      exported: !!c.video_url, thumb: await sign(supabaseAdmin, c.thumbnail_url),
    })));
    return { ok: true as const, clips };
  });

export const decideShared = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token: z.string().max(200), clipId: z.string().uuid(), decision: z.enum(["APPROVE", "CHANGES"]), note: z.string().max(1000).optional() }))
  .handler(async ({ data }) => {
    if (!shareTokenValid(data.token)) throw new Error("This review link has expired.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const c = (await supabaseAdmin.from("clips").select("id,owner_id,title,job_id,status,edits").eq("id", data.clipId).eq("share_token", data.token).maybeSingle()).data;
    if (!c) throw new Error("Clip not found.");
    const e = editsOf(c.edits);
    const patch = data.decision === "APPROVE"
      ? { status: c.status === "READY" || c.status === "EXPORTING" ? c.status : "APPROVED", edits: { ...e, client_feedback: "Approved by client" } }
      : { status: c.status === "READY" ? c.status : "FOUND", edits: { ...e, client_feedback: `Changes requested${data.note ? `: ${data.note}` : ""}` } };
    must(await supabaseAdmin.from("clips").update(patch as never).eq("id", c.id));
    await supabaseAdmin.from("notifications").insert({ owner_id: c.owner_id, user_id: c.owner_id, type: "SUBMISSION_REVIEWED", read: false,
      title: data.decision === "APPROVE" ? "Client approved a clip" : "Client requested changes",
      body: `${c.title ?? "A clip"}${data.note ? ` — ${data.note}` : ""}`, link: c.job_id ? `/review?job=${c.job_id}` : "/review" });
    return true;
  });

/**
 * A real trimmed preview from the Engine.
 *
 * The Review modal used to play the whole source video with a `#t=start,end`
 * marker on the URL — the browser seeks, but it is still the full file, and most
 * browsers ignore the end time, which is why the player showed the full length.
 * This renders an actual cut-down clip with its captions, crop and title burned
 * in, so what you watch is what you will export.
 */
export const clipPreview = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ clipId: z.string().uuid() }))
  .handler(async ({ context, data }): Promise<{ url: string }> => {
    const clip = (await context.supabase.from("clips")
      .select("id,engine_project_id,video_url").eq("id", data.clipId).maybeSingle()).data;
    if (!clip) throw new Error("That clip no longer exists.");
    // Already exported: the finished file beats a preview render.
    if (clip.video_url) return { url: clip.video_url };
    if (!clip.engine_project_id) {
      throw new Error("This clip has not reached the Engine yet, so it cannot be previewed.");
    }
    const { engineClient } = await import("./engine.server");
    const r = await engineClient<{ preview_url: string }>(
      "POST", `/v1/projects/${encodeURIComponent(clip.engine_project_id)}/preview`);
    if (!r.ok) throw new Error(r.error.message);
    return { url: r.data.preview_url };
  });
