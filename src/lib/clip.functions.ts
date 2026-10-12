import { createHmac } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/start-server-core";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  ACTIVE_STATUSES, ASPECT_OPTIONS, CLIP_COUNT_MAX, CLIP_COUNT_MIN, DONT_CLIP_MAX_MS, EDIT_LEVELS, estimateWaitMinutes,
  HEADLINE_TOP_DEFAULT, LAYOUT_OPTIONS, MAX_MUST_INCLUDE, MAX_PROMPT_CHARS, MAX_SOURCE_MS, MIN_SOURCE_MS, MODE_OPTIONS,
  parseClipLength, rangeIssue, sourceDurationIssue,
} from "./clip-rules";

const coverageEnum = z.enum(["BEST_MOMENTS", "WHOLE_VIDEO", "DONT_CLIP"]);
const modeEnum = z.enum(["AUTO", "SPEECH", "ENERGY", "VISUAL"]);
const layoutEnum = z.enum(["full_video", "streamer", "split", "two_up", "three_up", "four_up", "screenshare", "black_box", "title_subtitles"]);
const editLevelEnum = z.enum(["cuts_only", "captions", "cropped", "full"]);
const aspectEnum = z.enum(["9:16", "1:1", "4:5", "16:9"]);
const zoomEnum = z.enum(["Subtle", "Balanced", "Dynamic", "Max"]);
const gradeEnum = z.enum(["none", "warm", "cool", "punchy"]);

const extrasSchema = z.object({
  removeSilences: z.boolean().default(false),
  removeFillers: z.boolean().default(false),
  zoom: zoomEnum.default("Balanced"),
  autoTransitions: z.boolean().default(false),
  soundEffects: z.boolean().default(false),
  grade: gradeEnum.default("none"),
  keywordHighlight: z.boolean().default(false),
  emojis: z.boolean().default(false),
  autoBroll: z.boolean().default(false),
});

const jobFormSchema = z.object({
  sourceId: z.string().uuid(),
  rangeStartMs: z.number().int().min(0).nullable().default(null),
  rangeEndMs: z.number().int().min(0).nullable().default(null),
  coverage: coverageEnum.default("BEST_MOMENTS"),
  clipCount: z.union([z.literal("auto"), z.number().int().min(CLIP_COUNT_MIN).max(CLIP_COUNT_MAX)]).default("auto"),
  lengthPreset: z.string().max(10).default("auto"),
  lengthMinS: z.number().int().min(0).max(3600).default(45),
  lengthMaxS: z.number().int().min(0).max(3600).default(120),
  genre: z.string().trim().max(40).default("Auto"),
  mode: modeEnum.default("AUTO"),
  prompt: z.string().trim().max(MAX_PROMPT_CHARS).default(""),
  mustInclude: z.array(z.string().trim().min(1).max(200)).max(MAX_MUST_INCLUDE).default([]),
  headlineTopN: z.number().int().min(0).max(50).default(HEADLINE_TOP_DEFAULT),
  alternates: z.boolean().default(false),
  editLevel: editLevelEnum.default("full"),
  aspect: aspectEnum.default("9:16"),
  layouts: z.array(layoutEnum).min(1).max(5).default(["streamer"]),
  framing: z.enum(["auto", "both", "centre"]).default("auto"),
  language: z.string().trim().max(12).default("auto"),
  captionLanguage: z.string().trim().max(12).default("same"),
  extras: extrasSchema.default({ removeSilences: false, removeFillers: false, zoom: "Balanced", autoTransitions: false, soundEffects: false, grade: "none", keywordHighlight: false, emojis: false, autoBroll: false }),
  brollAssetId: z.string().uuid().nullable().default(null),
  musicAssetId: z.string().uuid().nullable().default(null),
});

export const clipWorkspace = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const [jobs, sources, music, badge, kit] = await Promise.all([
    context.supabase.from("clip_jobs").select("*,source_assets(name,thumbnail_url,duration_ms,niche)").order("created_at", { ascending: false }).limit(50),
    context.supabase.from("source_assets").select("id,name,kind,status,duration_ms,niche,thumbnail_url").eq("status", "READY").in("kind", ["UPLOAD", "LINK"]).order("created_at", { ascending: false }).limit(200),
    context.supabase.from("assets").select("id,name").eq("source", "MUSIC").eq("status", "READY").order("created_at", { ascending: false }).limit(100),
    context.supabase.from("clips").select("id", { count: "exact", head: true }).eq("status", "FOUND"),
    context.supabase.from("brand_kits").select("default_aspect,default_layout,ai_toggles").eq("user_id", context.userId).maybeSingle(),
  ]);
  if (jobs.error) throw new Error(jobs.error.message);
  if (sources.error) throw new Error(sources.error.message);
  if (music.error) throw new Error(music.error.message);
  const pending = (jobs.data ?? []).filter((j) => ACTIVE_STATUSES.includes(j.status)).length;
  return {
    jobs: jobs.data ?? [],
    sources: sources.data ?? [],
    music: music.data ?? [],
    queue: { pending, waitMinutes: estimateWaitMinutes(pending) },
    badge: badge.count ?? 0,
    defaults: kit.data ?? null,
  };
});
export type ClipWorkspace = Awaited<ReturnType<typeof clipWorkspace>>;

/** Creates a QUEUED clip job. Errors mirror the document's message mapping. */
export const createClipJob = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(jobFormSchema)
  .handler(async ({ context, data }) => {
    const src = (await context.supabase.from("source_assets").select("id,name,duration_ms,status,kind,niche").eq("id", data.sourceId).single()).data;
    if (!src) throw new Error("That source no longer exists.");
    if (src.status !== "READY") throw new Error("This source is not ready yet.");
    if (!["UPLOAD", "LINK"].includes(src.kind)) throw new Error("Only videos can be clipped.");
    const durationIssue = sourceDurationIssue(src.duration_ms);
    if (durationIssue) throw new Error(durationIssue);
    const rangeProblem = rangeIssue(data.rangeStartMs, data.rangeEndMs, src.duration_ms);
    if (rangeProblem) throw new Error(rangeProblem);
    if (data.coverage === "DONT_CLIP" && (data.rangeStartMs != null ? data.rangeEndMs! - data.rangeStartMs! : src.duration_ms!) > DONT_CLIP_MAX_MS) {
      throw new Error("Don't clip makes one clip of up to 15 minutes — pick a shorter part.");
    }
    const length = parseClipLength(data.lengthPreset, data.lengthMinS, data.lengthMaxS);
    if (typeof length === "object" && length !== null && "error" in length) throw new Error(length.error);
    const ins = await context.supabase.from("clip_jobs").insert({
      owner_id: context.userId,
      created_by: context.userId,
      engine: "NATIVE",
      engine_job_id: `cz_${crypto.randomUUID()}`,
      status: "QUEUED",
      source_asset_id: data.sourceId,
      coverage: data.coverage,
      clip_count: data.clipCount,
      clip_length: length as never,
      range_start_ms: data.rangeStartMs,
      range_end_ms: data.rangeEndMs,
      genre: data.genre,
      mode: data.mode,
      prompt: data.prompt || null,
      must_include: data.mustInclude as never,
      headline_top_n: data.headlineTopN,
      alternates: data.alternates,
      edit_level: data.editLevel,
      aspect: data.aspect,
      framing: data.framing,
      language: data.language,
      caption_language: data.captionLanguage,
      music_asset_id: data.musicAssetId,
      broll_asset_id: data.brollAssetId,
      formats: { layouts: data.layouts, extras: data.extras } as never,
      progress: 0,
    }).select("id").single();
    if (ins.error) throw new Error(ins.error.message);
    return { id: ins.data.id };
  });

/** Accepts (or changes) the AI-suggested count on a paused job. */
export const confirmClipCount = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ jobId: z.string().uuid(), count: z.number().int().min(CLIP_COUNT_MIN).max(CLIP_COUNT_MAX) }))
  .handler(async ({ context, data }) => {
    const job = (await context.supabase.from("clip_jobs").select("id,status").eq("id", data.jobId).maybeSingle()).data;
    if (!job) throw new Error("That clip job no longer exists.");
    if (job.status !== "AWAITING_CONFIRMATION") throw new Error("This job is not waiting for a count.");
    const u = await context.supabase.from("clip_jobs").update({ clip_count: data.count, status: "PROCESSING", stage: "BUILDING", progress: 55 }).eq("id", data.jobId);
    if (u.error) throw new Error(u.error.message);
    return true;
  });

/** Fallback sync: advances internal jobs (the Engine's polling stand-in). */
export const syncClipJobs = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { advanceActiveJobs } = await import("./clip-engine.server");
  const changed = await advanceActiveJobs(context.supabase);
  return { changed };
});

/** "Save as my defaults" writes the form's key choices to the BrandKit. */
export const saveClipDefaults = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    aspect: aspectEnum, layout: layoutEnum,
    aiToggles: z.object({
      coverage: coverageEnum, mode: modeEnum, editLevel: editLevelEnum,
      lengthPreset: z.string().max(10), framing: z.enum(["auto", "both", "centre"]),
      removeSilences: z.boolean(), removeFillers: z.boolean(), zoom: zoomEnum,
      autoTransitions: z.boolean(), soundEffects: z.boolean(), grade: gradeEnum,
      keywordHighlight: z.boolean(), emojis: z.boolean(), headlineTopN: z.number().int().min(0).max(50),
    }),
  }))
  .handler(async ({ context, data }) => {
    const row = (await context.supabase.from("brand_kits").select("id").eq("user_id", context.userId).maybeSingle()).data;
    const values = { default_aspect: data.aspect, default_layout: data.layout, ai_toggles: data.aiToggles as never };
    const r = row
      ? await context.supabase.from("brand_kits").update(values).eq("id", row.id)
      : await context.supabase.from("brand_kits").insert({ owner_id: context.userId, user_id: context.userId, ...values });
    if (r.error) throw new Error(r.error.message);
    return true;
  });

/** Settings → Engine card: sends a signed test event through the webhook. */
export const sendEngineTest = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async () => {
  const secret = process.env["ENGINE_WEBHOOK_SECRET"];
  if (!secret) throw new Error("The Engine webhook secret is not set yet — add ENGINE_WEBHOOK_SECRET in Secrets first.");
  const origin = new URL(getRequest().url).origin;
  const ev = { id: `test_${crypto.randomUUID()}`, type: "test.ping", data: { sent_at: new Date().toISOString() } };
  const body = JSON.stringify(ev);
  const t = Math.floor(Date.now() / 1000);
  const signature = `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;
  const res = await fetch(`${origin}/api/public/hooks/engine`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-crayz-signature": signature },
    body,
  });
  return { ok: res.ok, status: res.status };
});

export const CLIP_FORM_CONSTANTS = { ASPECT_OPTIONS, EDIT_LEVELS, LAYOUT_OPTIONS, MODE_OPTIONS };
export type ClipJobForm = z.infer<typeof jobFormSchema>;
export { MIN_SOURCE_MS, MAX_SOURCE_MS };

/** Sidebar badge: clips sitting in Review, found but not yet approved. */
export const clipBadge = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const r = await context.supabase.from("clips").select("id", { count: "exact", head: true }).eq("status", "FOUND");
  if (r.error) return { found: 0 };
  return { found: r.count ?? 0 };
});
