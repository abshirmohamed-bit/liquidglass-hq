import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/**
 * Rendering happens on the Engine, not in the browser.
 *
 * The old path rendered each clip with ffmpeg inside the tab, so the tab had
 * to stay open and nothing could be rendered while you were away. The Engine
 * renders on its own and reports back on the export.completed webhook, which
 * is what lets a job finish with nobody watching.
 */

type Db = SupabaseClient<Database>;
export type Resolution = "HD" | "UHD";

type Row = {
  id: string;
  start_ms: number | null;
  end_ms: number | null;
  aspect: string | null;
  layout: string | null;
  caption_style_id: string | null;
  title_text: string | null;
  title_style: string | null;
  watermark_text: string | null;
  overlays: unknown;
  caption_options: unknown;
  engine_project_id: string | null;
  edits: unknown;
};

const SELECT =
  "id,start_ms,end_ms,aspect,layout,caption_style_id,title_text,title_style,watermark_text,overlays,caption_options,engine_project_id,edits";

/** The clip as it looks here, in the shape the Engine's PATCH expects. */
function patchFor(c: Row): Record<string, unknown> {
  const p: Record<string, unknown> = {};
  if (typeof c.start_ms === "number" && typeof c.end_ms === "number" && c.end_ms > c.start_ms) {
    // The Engine re-slices the words to match, so captions follow the trim.
    p["in_ms"] = c.start_ms;
    p["out_ms"] = c.end_ms;
  }
  if (c.aspect) p["aspect"] = c.aspect;
  // Without this the layout chosen in the editor never reaches the render.
  if (c.layout) p["layout"] = c.layout;
  if (c.caption_style_id) p["caption_style_id"] = c.caption_style_id;
  return { ...p, ...overlayPatch(c) };
}

/**
 * Title, handle and captions on/off, always sent. An empty object clears the
 * Engine's copy, so removing a title or handle in the editor removes it from
 * the video instead of leaving the previous one burned in. Position and
 * opacity come from the editor, not fixed values.
 */
export function overlayPatch(c: Pick<Row, "title_text" | "title_style" | "watermark_text" | "overlays" | "caption_options">) {
  const ov = (c.overlays && typeof c.overlays === "object" ? c.overlays : {}) as {
    watermark?: { pos?: string; opacity?: number };
  };
  const enabled = (c.caption_options as { enabled?: boolean } | null)?.enabled !== false;
  return {
    title: c.title_text?.trim() ? { text: c.title_text.trim(), style: c.title_style || "bold_band" } : {},
    watermark: c.watermark_text?.trim()
      ? { text: c.watermark_text.trim(), position: ov.watermark?.pos ?? "centre-below-captions", opacity: ov.watermark?.opacity ?? 0.5 }
      : {},
    caption_options: { enabled },
  };
}

async function fail(db: Db, id: string, message: string) {
  await db.from("clips").update({ status: "FAILED", error: message }).eq("id", id);
}

/**
 * Send clips to the Engine to render. Anything changed here — the trim, the
 * aspect, the caption style, the title, the watermark — is pushed first, so
 * the Engine renders the clip as it looks in Review.
 */
export async function exportClipsOnEngine(db: Db, ids: string[], resolution: Resolution) {
  const rows = ((
    await db.from("clips").select(SELECT).in("id", ids).in("status", ["APPROVED", "READY"])
  ).data ?? []) as Row[];
  const { engineClient } = await import("./engine.server");
  const started: string[] = [];
  const failed: { id: string; error: string }[] = [];

  for (const c of rows) {
    if (!c.engine_project_id) {
      const why = "This clip never reached the Engine, so there is nothing to render.";
      await fail(db, c.id, why);
      failed.push({ id: c.id, error: why });
      continue;
    }
    const pid = encodeURIComponent(c.engine_project_id);
    const patch = patchFor(c);
    const pr = await engineClient("PATCH", `/v1/projects/${pid}`, patch);
    // Rendering after a rejected update would export the old look and call it done.
    if (!pr.ok) {
      await fail(db, c.id, pr.error.message);
      failed.push({ id: c.id, error: pr.error.message });
      continue;
    }

    const r = await engineClient<{ id: string }>("POST", `/v1/projects/${pid}/export`, {
      resolution: resolution === "UHD" ? "2160p" : "1080p",
    });
    if (!r.ok) {
      await fail(db, c.id, r.error.message);
      failed.push({ id: c.id, error: r.error.message });
      continue;
    }
    const edits = (c.edits && typeof c.edits === "object" ? c.edits : {}) as Record<
      string,
      unknown
    >;
    await db
      .from("clips")
      .update({
        status: "EXPORTING",
        engine_export_id: r.data.id,
        resolution,
        error: null,
        edits: {
          ...edits,
          finish_dirty: undefined,
          export_started_at: new Date().toISOString(),
        } as never,
      })
      .eq("id", c.id);
    started.push(c.id);
  }
  return { started, failed };
}
