import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { sign, editsOf, must } from "./review-helpers";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/**
 * Clips made before the Engine started handing its finish data over have no
 * captions on the row, and clips whose webhook went astray have none either.
 * Both cases are repairable without transcribing anything: the Engine still
 * holds the words it made while the source was processing. Fetch them once,
 * write them to the row, and the clip is never short again.
 */
async function backfillFinish(db: SupabaseClient<Database>, clip: Record<string, unknown>) {
  const pid = clip["engine_project_id"];
  if (typeof pid !== "string" || !pid) return clip;
  if (Array.isArray(clip["captions"]) && clip["captions"].length) return clip;
  const { engineClient } = await import("./engine.server");
  const r = await engineClient<Record<string, unknown>>("GET", `/v1/projects/${pid}`);
  if (!r.ok) return clip;
  const { finishColumns } = await import("./engine-events.server");
  // in_ms is where this clip starts in the source; the cues are stored in
  // source time so the player, the seek and the displayed time all agree.
  const inMs = typeof r.data["in_ms"] === "number" ? Math.round(r.data["in_ms"]) : 0;
  const patch = finishColumns(r.data, inMs);
  if (!patch["captions"]) return clip;
  const saved = await db
    .from("clips")
    .update(patch as never)
    .eq("id", clip["id"] as string)
    .select("*")
    .maybeSingle();
  return (saved.data as Record<string, unknown> | null) ?? { ...clip, ...patch };
}
/** Simple Editor data: the clip, its playable source and sibling clips for "apply to several". */
export const editorData = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    const db = context.supabase;
    const row = must(await db.from("clips").select("*").eq("id", data.id).single());
    const c = (await backfillFinish(db, row as unknown as Record<string, unknown>).catch(
      () => row,
    )) as typeof row;
    const src = c.source_asset_id ? (await db.from("source_assets").select("id,name,public_url,duration_ms,width,height").eq("id", c.source_asset_id).maybeSingle()).data : null;
    const others = must(await db.from("clips").select("id,title,status,start_ms,end_ms").neq("id", c.id).in("status", ["FOUND", "APPROVED", "READY"]).order("created_at", { ascending: false }).limit(200));
    const brand = (await db.from("brand_kits").select("handle,caption_style_id,caption_style").eq("user_id", context.userId).maybeSingle()).data;
    return { clip: { ...c, video_url: await sign(db, c.video_url), thumbnail_url: await sign(db, c.thumbnail_url) }, source: src ? { ...src, playUrl: await sign(db, src.public_url) } : null, others, brand };
  });

const style = z.object({ size: z.number(), fill: z.string().max(9), outline: z.string().max(9), outlineW: z.number(), shadow: z.boolean(), box: z.boolean(), boxColor: z.string().max(9), boxOpacity: z.number(), uppercase: z.boolean(), active: z.string().max(9).nullable(), animation: z.enum(["none", "pop", "karaoke", "bounce", "typewriter"]), maxWords: z.number(), x: z.number().min(0).max(100), y: z.number().min(0).max(100) }).partial();
const cue = z.object({ start_ms: z.number().int(), end_ms: z.number().int(), text: z.string().max(400) });
const finishPatch = z.object({
  caption_style_id: z.string().max(40).optional(), caption_style: style.optional(), captions: z.array(cue).max(2000).optional(),
  caption_options: z.object({ enabled: z.boolean() }).optional(), title_text: z.string().max(140).optional(), title_style: z.enum(["bold_band", "boxed", "minimal", "headline"]).optional(),
  overlays: z.object({ title: z.object({ y: z.number().min(0).max(100), highlight_word: z.string().max(40).optional(), highlight: z.enum(["red", "yellow", "blue"]).optional() }).optional(), watermark: z.object({ pos: z.enum(["top-left", "top-right", "bottom-left", "bottom-right", "centre-below-captions"]), opacity: z.number().min(0.1).max(1) }).optional() }).optional(),
  watermark_text: z.string().max(60).optional(), aspect: z.enum(["9:16", "1:1", "4:5", "16:9"]).optional(),
});

/** Saves Finish settings on one clip, or the style/position/title/watermark on several at once. Captions text stays per clip. */
export const saveFinish = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ ids: z.array(z.string().uuid()).min(1).max(200), patch: finishPatch, saveAsBrand: z.boolean().optional() }))
  .handler(async ({ context, data }) => {
    const db = context.supabase;
    const rows = must(await db.from("clips").select("id,status,edits").in("id", data.ids));
    for (const [i, r] of rows.entries()) {
      const { captions, ...shared } = data.patch;
      const patch: Record<string, unknown> = { ...shared };
      if (captions && (rows.length === 1 || i === rows.findIndex((x) => x.id === data.ids[0]))) patch["captions"] = captions;
      if (r.status === "READY") patch["edits"] = { ...editsOf(r.edits), finish_dirty: true };
      must(await db.from("clips").update(patch as never).eq("id", r.id).select("id").single());
    }
    if (data.saveAsBrand) {
      const kit = { handle: data.patch.watermark_text ?? null, caption_style_id: data.patch.caption_style_id ?? null, caption_style: (data.patch.caption_style ?? null) as never, default_aspect: data.patch.aspect ?? null };
      const have = (await db.from("brand_kits").select("id").eq("user_id", context.userId).maybeSingle()).data;
      if (have) must(await db.from("brand_kits").update(kit).eq("id", have.id).select("id").single());
      else must(await db.from("brand_kits").insert({ ...kit, user_id: context.userId, owner_id: context.userId }).select("id").single());
    }
    return rows.length;
  });

/** Transcribes one short audio chunk (a few seconds) through the AI gateway; the editor spreads word timings inside the chunk. */
export const transcribeChunk = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ audio: z.string().min(10).max(3_000_000), mime: z.enum(["audio/mpeg", "audio/wav"]), language: z.string().max(8).optional() }))
  .handler(async ({ data }) => {
    const { requireAi } = await import("./ai/provider.server");
    const ai = requireAi();
    const bytes = Uint8Array.from(atob(data.audio), (ch) => ch.charCodeAt(0));
    const form = new FormData();
    form.append("model", ai.transcribeModel);
    form.append("file", new File([bytes], data.mime === "audio/wav" ? "chunk.wav" : "chunk.mp3", { type: data.mime }));
    form.append("response_format", "json");
    form.append("stream", "true");
    if (data.language) form.append("language", data.language);
    const res = await fetch(`${ai.baseURL}/audio/transcriptions`, { method: "POST", headers: { Authorization: `Bearer ${ai.apiKey}` }, body: form });
    if (res.status === 429) throw new Error("Too many requests right now. Try again in a moment.");
    if (res.status === 402) throw new Error("AI credits have run out. Add credits in your workspace to continue.");
    if (!res.ok || !res.body) { const t = await res.text().catch(() => ""); console.error("transcribe failed", res.status, t.slice(0, 300)); throw new Error(`Transcription failed (${res.status}).`); }
    const reader = res.body.getReader(); const dec = new TextDecoder();
    let buf = "", done = "", deltas = "";
    for (;;) {
      const { value, done: end } = await reader.read();
      if (end) break;
      buf += dec.decode(value, { stream: true }).replace(/\r/g, "");
      let i: number;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const frame = buf.slice(0, i); buf = buf.slice(i + 2);
        for (const line of frame.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim(); if (!payload || payload === "[DONE]") continue;
          try { const ev = JSON.parse(payload) as { type?: string; text?: string; delta?: string }; if (ev.type === "transcript.text.done" && ev.text != null) done = ev.text; else if (ev.delta) deltas += ev.delta; } catch { /* partial */ }
        }
      }
    }
    for (const line of buf.split("\n")) { if (!line.startsWith("data:")) continue; try { const ev = JSON.parse(line.slice(5).trim()) as { type?: string; text?: string; delta?: string }; if (ev.type === "transcript.text.done" && ev.text != null) done = ev.text; else if (ev.delta) deltas += ev.delta; } catch { /* not JSON */ } }
    return (done || deltas).trim();
  });
