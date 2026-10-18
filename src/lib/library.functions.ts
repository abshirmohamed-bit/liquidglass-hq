import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { kindOf, validateUpload, isDirectFileUrl, ASSET_TYPE_FOR } from "./library-rules";

type EngineAsset = { id: string; url?: string; length?: number; width?: number; height?: number; fps?: number; size?: number; thumbnail_url?: string; quality_warning?: boolean; status?: string; error?: { message?: string } | string };
const engine = async () => (await import("./engine.server")).engineClient;
const fail = (e: { code: string; message: string }) => { throw new Error(e.message); };

/** engineAccount + health: drives the status strip and graceful degradation. */
export const engineAccount = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async () => {
  const ec = await engine();
  const h = await ec("GET", "/v1/health");
  if (!h.ok) return { connected: false, reason: h.error.message, account: null };
  const a = await ec<{ storage?: { used?: number; limit?: number }; storage_used?: number; storage_limit?: number; queue?: { pending?: number; jobs_waiting?: number; estimated_wait_minutes?: number; estimated_wait?: number } }>("GET", "/v1/account");
  if (!a.ok) return { connected: true, reason: "", account: null };
  const d = a.data; const q = d.queue ?? {};
  return { connected: true, reason: "", account: { used: d.storage?.used ?? d.storage_used ?? 0, limit: d.storage?.limit ?? d.storage_limit ?? 0, pending: q.pending ?? q.jobs_waiting ?? 0, wait: q.estimated_wait_minutes ?? q.estimated_wait ?? 0 } };
});

export const listLibrary = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const [s, a, c, p] = await Promise.all([
    context.supabase.from("source_assets").select("*").order("created_at", { ascending: false }),
    context.supabase.from("assets").select("*").order("created_at", { ascending: false }),
    context.supabase.from("clips").select("id,title,thumbnail_url,video_url,duration_ms,status,created_at").eq("status", "READY").order("created_at", { ascending: false }),
    context.supabase.from("clips").select("id,title,thumbnail_url,duration_ms,status,job_id").neq("status", "REJECTED").order("created_at", { ascending: false }),
  ]);
  if (s.error) throw new Error(s.error.message);
  if (a.error) throw new Error(a.error.message);
  if (c.error) throw new Error(c.error.message);
  if (p.error) throw new Error(p.error.message);
  const sign = async (u: string | null) => {
    if (!u?.startsWith("storage://media/")) return u;
    return (await context.supabase.storage.from("media").createSignedUrl(u.slice(16), 7 * 86400)).data?.signedUrl ?? null;
  };
  const sources = await Promise.all(s.data.map(async (x) => ({ ...x, thumbnail_url: await sign(x.thumbnail_url) })));
  const clips = await Promise.all((c.data ?? []).map(async (x) => ({ ...x, thumbnail_url: await sign(x.thumbnail_url), video_url: await sign(x.video_url) })));
  const assets = await Promise.all(a.data.map(async (x) => ({ ...x, url: await sign(x.url) })));
  const projects = await Promise.all(p.data.map(async (x) => ({ ...x, thumbnail_url: await sign(x.thumbnail_url) })));
  return { sources, assets, clips, projects };
});

const sourceFields = (x: EngineAsset) => ({ engine_asset_id: x.id, public_url: x.url ?? null, duration_ms: x.length != null ? Math.round(x.length * 1000) : null, size_bytes: x.size ?? null, width: x.width ?? null, height: x.height ?? null, fps: x.fps ?? null, source_height: x.height ?? null, quality_warning: !!x.quality_warning, thumbnail_url: x.thumbnail_url ?? null, status: "READY", error: null });

/** engineUpload action "start". */
export const uploadStart = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ filename: z.string().min(1).max(300), contentType: z.string().max(200), sizeBytes: z.number().int().positive(), source: z.enum(["UPLOAD", "BROLL", "MUSIC", "SFX", "IMAGE", "FONT"]).default("UPLOAD"), tags: z.array(z.string().max(40)).max(10).default([]) }))
  .handler(async ({ context, data }) => {
    const bad = validateUpload(data.filename, data.sizeBytes); if (bad) throw new Error(bad);
    const kind = kindOf(data.filename)!;
    const r = await (await engine())<{ id: string; url: string; method?: string; headers?: Record<string, string> }>("POST", "/v1/uploads", { filename: data.filename, content_type: data.contentType, size_bytes: data.sizeBytes });
    if (!r.ok) fail(r.error);
    const up = (r as { data: { id: string; url: string; method?: string; headers?: Record<string, string> } }).data;
    let rowId: string | null = null; let table: "source_assets" | "assets" | "subtitle" = "subtitle";
    if (kind === "SUBTITLE") { /* subtitle files get no row; their url is stored on the source */ }
    else if (kind === "VIDEO" && data.source === "UPLOAD") {
      const ins = await context.supabase.from("source_assets").insert({ name: data.filename, kind: "UPLOAD", status: "UPLOADING", size_bytes: data.sizeBytes }).select("id").single();
      if (ins.error) throw new Error(ins.error.message); rowId = ins.data.id; table = "source_assets";
    } else {
      const src = data.source === "UPLOAD" ? (kind === "FONT" ? "FONT" : kind === "IMAGE" ? "IMAGE" : kind === "AUDIO" ? "MUSIC" : "BROLL") : data.source;
      const ins = await context.supabase.from("assets").insert({ name: data.filename, type: ASSET_TYPE_FOR[kind]!, source: src, status: "UPLOADING", size_bytes: data.sizeBytes, tags: data.tags }).select("id").single();
      if (ins.error) throw new Error(ins.error.message); rowId = ins.data.id; table = "assets";
    }
    return { uploadId: up.id, url: up.url, method: up.method ?? "PUT", headers: up.headers ?? {}, rowId, table };
  });

/** engineUpload action "complete". */
export const uploadComplete = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ uploadId: z.string().min(1).max(200), rowId: z.string().uuid().nullable(), table: z.enum(["source_assets", "assets", "subtitle"]), failed: z.string().max(500).optional() }))
  .handler(async ({ context, data }): Promise<{ url: string | null }> => {
    if (data.table === "subtitle" || !data.rowId) {
      const r = await (await engine())<EngineAsset>("POST", `/v1/uploads/${encodeURIComponent(data.uploadId)}/complete`);
      if (!r.ok) throw new Error(r.error.message);
      return { url: r.data.url ?? null };
    }
    const rowId = data.rowId; const table = data.table;
    const markFail = async (message: string) => { await context.supabase.from(table).update({ status: "FAILED", error: message }).eq("id", rowId); throw new Error(message); };
    if (data.failed) return markFail(data.failed);
    const ec = await engine();
    const r = await ec<EngineAsset>("POST", `/v1/uploads/${encodeURIComponent(data.uploadId)}/complete`);
    if (!r.ok) return markFail(r.error.message);
    const x = r.data;
    if (table === "source_assets") {
      const u = await context.supabase.from("source_assets").update(sourceFields(x)).eq("id", rowId);
      if (u.error) throw new Error(u.error.message);
    } else {
      const row = await context.supabase.from("assets").select("type").eq("id", rowId).single();
      if (row.data?.type === "FONT") { const f = await ec("POST", "/v1/fonts", { asset_id: x.id }); if (!f.ok) return markFail(f.error.message); }
      const u = await context.supabase.from("assets").update({ engine_asset_id: x.id, url: x.url ?? null, duration_ms: x.length != null ? Math.round(x.length * 1000) : null, size_bytes: x.size ?? null, status: "READY", error: null }).eq("id", rowId);
      if (u.error) throw new Error(u.error.message);
    }
    return { url: null };
  });

/** Subtitle files: uploaded through the Engine, then aligned once the source is READY. */
export const attachSubtitles = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ sourceId: z.string().uuid(), srtUrl: z.string().url().max(2000) }))
  .handler(async ({ context, data }) => {
    const s = await context.supabase.from("source_assets").update({ subtitle_file_url: data.srtUrl }).eq("id", data.sourceId).select("status,engine_asset_id").single();
    if (s.error) throw new Error(s.error.message);
    if (s.data.status === "READY" && s.data.engine_asset_id) {
      const r = await (await engine())("POST", "/v1/transcripts", { asset_id: s.data.engine_asset_id, srt_url: data.srtUrl });
      if (!r.ok) fail(r.error);
      await context.supabase.from("source_assets").update({ transcript_status: "PENDING" }).eq("id", data.sourceId);
    }
    return true;
  });

/** engineImport: crayZmundo's own downloader. */
export const engineImport = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ url: z.string().url().max(2000), name: z.string().max(300).optional(), rightsConfirmed: z.boolean() }))
  .handler(async ({ context, data }) => {
    const direct = isDirectFileUrl(data.url);
    if (!direct && !data.rightsConfirmed) throw new Error("Tick “I own this footage or have the rights to clip it” first.");
    const name = data.name || data.url;
    const r = await (await engine())<EngineAsset>("POST", "/v1/assets", direct ? { url: data.url, name } : { url: data.url, name, rights_confirmed: true });
    if (!r.ok) fail(r.error);
    const x = (r as { data: EngineAsset }).data;
    if (x.status === "failed") throw new Error(typeof x.error === "string" ? x.error : x.error?.message || "Import failed");
    const ready = !!x.url && x.status === "ready";
    const existing = await context.supabase.from("source_assets").select("id").eq("engine_asset_id", x.id).neq("status", "TRASHED").order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (existing.error) throw new Error(existing.error.message);
    if (existing.data) {
      if (ready) {
        const updated = await context.supabase.from("source_assets").update(sourceFields(x)).eq("id", existing.data.id);
        if (updated.error) throw new Error(updated.error.message);
      }
      return { id: existing.data.id, ready };
    }
    const ins = await context.supabase.from("source_assets").insert({ name, kind: "LINK", source_url: data.url, ...(ready ? sourceFields(x) : { engine_asset_id: x.id, status: "UPLOADING" }) }).select("id").single();
    if (ins.error) throw new Error(ins.error.message);
    return { id: ins.data.id, ready };
  });

/** Refresh only this owner's requested source, without polling unrelated imports. */
export const importedSourceStatus = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    const row = await context.supabase.from("source_assets").select("status,error,engine_asset_id").eq("id", data.id).maybeSingle();
    if (row.error) throw new Error(row.error.message);
    if (!row.data) throw new Error("That video is no longer in your library — it may have been deleted while it was importing.");
    if (row.data.status !== "UPLOADING" || !row.data.engine_asset_id) return { status: row.data.status, error: row.data.error };
    const r = await (await engine())<EngineAsset>("GET", `/v1/assets/${encodeURIComponent(row.data.engine_asset_id)}`);
    if (!r.ok) throw new Error(r.error.message);
    const x = r.data;
    const fields = x.status === "failed"
      ? { status: "FAILED", error: typeof x.error === "string" ? x.error : x.error?.message || "Import failed" }
      : x.status === "ready" && x.url ? sourceFields(x) : null;
    if (!fields) return { status: "UPLOADING", error: null };
    // This runs on a poll, so it must not be the thing that kills a job. A
    // write that returns no row is not proof the write failed — read the row
    // back and report what is actually there.
    const updated = await context.supabase.from("source_assets").update(fields).eq("id", data.id).select("status,error").maybeSingle();
    if (updated.error) throw new Error(updated.error.message);
    if (updated.data) return updated.data;
    const after = await context.supabase.from("source_assets").select("status,error").eq("id", data.id).maybeSingle();
    if (after.data) return after.data;
    return { status: String(fields.status ?? "UPLOADING"), error: null };
  });

/** Polls GET /v1/assets/{id} for link imports still UPLOADING. */
export const pollImports = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const rows = await context.supabase.from("source_assets").select("id,engine_asset_id,subtitle_file_url").eq("status", "UPLOADING").eq("kind", "LINK").not("engine_asset_id", "is", null);
  const ec = await engine(); let changed = 0;
  for (const row of rows.data ?? []) {
    const r = await ec<EngineAsset>("GET", `/v1/assets/${encodeURIComponent(row.engine_asset_id!)}`);
    if (!r.ok) continue;
    const x = r.data;
    if (x.status === "failed" || x.error) { await context.supabase.from("source_assets").update({ status: "FAILED", error: typeof x.error === "string" ? x.error : x.error?.message ?? "Import failed" }).eq("id", row.id); changed++; }
    else if (x.url && x.status !== "importing" && x.status !== "pending") {
      await context.supabase.from("source_assets").update(sourceFields(x)).eq("id", row.id); changed++;
      if (row.subtitle_file_url) await ec("POST", "/v1/transcripts", { asset_id: x.id, srt_url: row.subtitle_file_url });
    }
  }
  return { changed };
});

const idInput = z.object({ id: z.string().uuid(), table: z.enum(["source_assets", "assets"]) });
export const renameItem = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(idInput.extend({ name: z.string().trim().min(1).max(300) }))
  .handler(async ({ context, data }) => { const r = await context.supabase.from(data.table).update({ name: data.name }).eq("id", data.id); if (r.error) throw new Error(r.error.message); return true; });

export const trashItem = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(idInput)
  .handler(async ({ context, data }) => { const r = await context.supabase.from(data.table).update({ status: "TRASHED", trashed_at: new Date().toISOString() }).eq("id", data.id); if (r.error) throw new Error(r.error.message); return true; });

export const restoreItem = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(idInput)
  .handler(async ({ context, data }) => {
    const cur = data.table === "assets" ? (await context.supabase.from("assets").select("url").eq("id", data.id).single()).data?.url : (await context.supabase.from("source_assets").select("public_url").eq("id", data.id).single()).data?.public_url;
    const r = await context.supabase.from(data.table).update({ status: cur ? "READY" : "FAILED", trashed_at: null }).eq("id", data.id);
    if (r.error) throw new Error(r.error.message); return true;
  });

/** engineAssets: Delete forever (Engine first, then the row and its clips). */
export const deleteForever = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(z.object({ ids: z.array(idInput).max(500) }))
  .handler(async ({ context, data }) => {
    const { deleteLibraryRow } = await import("./library.server");
    for (const i of data.ids) await deleteLibraryRow(context.supabase, i.table, i.id);
    return true;
  });

/** Delete whole videos for good, with every clip and job that came from them. */
export const deleteVideos = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ ids: z.array(z.string().uuid()).min(1).max(100) }))
  .handler(async ({ context, data }) => {
    const { deleteLibraryRow } = await import("./library.server");
    for (const id of data.ids) await deleteLibraryRow(context.supabase, "source_assets", id);
    return { deleted: data.ids.length };
  });

export const setBrollMeta = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid(), tags: z.array(z.string().trim().min(1).max(40)).max(10), isDefault: z.boolean() }))
  .handler(async ({ context, data }) => {
    if (data.isDefault) for (const t of data.tags) {
      const others = await context.supabase.from("assets").select("id,tags").eq("source", "BROLL").eq("is_default", true).neq("id", data.id);
      for (const o of others.data ?? []) if (Array.isArray(o.tags) && o.tags.includes(t)) await context.supabase.from("assets").update({ is_default: false }).eq("id", o.id);
    }
    const r = await context.supabase.from("assets").update({ tags: data.tags, is_default: data.isDefault }).eq("id", data.id);
    if (r.error) throw new Error(r.error.message); return true;
  });

/** Engine's bundled royalty-free music / sfx packs. */
export const engineCatalog = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).inputValidator(z.object({ kind: z.enum(["music", "sfx"]) }))
  .handler(async ({ data }) => {
    const r = await (await engine())<unknown>("GET", `/v1/${data.kind}`);
    if (!r.ok) return [] as { id: string; name: string; url: string | null; licence: string | null }[];
    type M = { id?: string | number; name?: string; title?: string; url?: string; license_url?: string; licence_url?: string };
    const d = r.data as { items?: M[]; data?: M[] } | M[];
    return (Array.isArray(d) ? d : d.items ?? d.data ?? []).slice(0, 200).map((m, i) => ({ id: String(m.id ?? i), name: m.name ?? m.title ?? "Track", url: m.url ?? null, licence: m.license_url ?? m.licence_url ?? null }));
  });

/** Internal engine upload: the file is already in app storage; record it as a READY source. */
export const nativeSource = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ name: z.string().min(1).max(300), path: z.string().min(1).max(400), thumbPath: z.string().max(400).nullable(), sizeBytes: z.number().int().positive(), durationMs: z.number().int().positive(), width: z.number().int().min(0), height: z.number().int().min(0) }))
  .handler(async ({ context, data }) => {
    const bad = validateUpload(data.name, data.sizeBytes); if (bad) throw new Error(bad);
    const ws = (await context.supabase.rpc("workspace_of", { _uid: context.userId })).data as string;
    if (!data.path.startsWith(`${ws}/`) || (data.thumbPath && !data.thumbPath.startsWith(`${ws}/`))) throw new Error("Invalid file location.");
    const r = await context.supabase.from("source_assets").insert({ name: data.name, kind: "UPLOAD", public_url: `storage://media/${data.path}`, thumbnail_url: data.thumbPath ? `storage://media/${data.thumbPath}` : null, size_bytes: data.sizeBytes, duration_ms: data.durationMs, width: data.width, height: data.height, source_height: data.height, quality_warning: data.height > 0 && data.height < 720, status: "READY" }).select("id").single();
    if (r.error) throw new Error(r.error.message);
    return r.data.id;
  });
