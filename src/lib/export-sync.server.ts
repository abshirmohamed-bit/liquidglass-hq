import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/** Reconcile durable Engine exports whichever clip screen is open. */
export async function syncExports(db: SupabaseClient<Database>, ids?: string[]) {
  let query = db.from("clips").select("id,engine_export_id").eq("status", "EXPORTING");
  if (ids) query = query.in("id", ids);
  const active = await query;
  if (active.error) throw new Error(active.error.message);
  const { engineClient } = await import("./engine.server");
  const { applyEngineEvent } = await import("./engine-events.server");
  await Promise.all((active.data ?? []).slice(0, 20).map(async (clip) => {
    if (!clip.engine_export_id || /^exp_[a-f0-9]+-/.test(clip.engine_export_id)) return;
    const result = await engineClient<{ status: string; asset?: Record<string, unknown>; error?: string }>("GET", `/v1/exports/${encodeURIComponent(clip.engine_export_id)}`);
    if (!result.ok || !["completed", "failed"].includes(result.data.status)) return;
    await applyEngineEvent(db, { id: `poll_${clip.engine_export_id}_${result.data.status}`, type: `export.${result.data.status}`, data: { export_id: clip.engine_export_id, asset: result.data.asset, error: result.data.error } });
  }));
}