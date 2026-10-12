import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { engineClient } from "./engine.server";

/** Delete forever: DELETE /v1/assets/{id} on the Engine, then the row (and a source's clips). */
export async function deleteLibraryRow(db: SupabaseClient<Database>, table: "source_assets" | "assets", id: string) {
  const row = await db.from(table).select("engine_asset_id").eq("id", id).single();
  if (row.error) throw new Error(row.error.message);
  const eid = row.data.engine_asset_id;
  if (eid) {
    const r = await engineClient("DELETE", `/v1/assets/${encodeURIComponent(eid)}`);
    if (!r.ok && r.error.code !== "not_found" && r.error.code !== "HTTP_404") throw new Error(r.error.message);
  }
  if (table === "source_assets") await db.from("clips").delete().eq("source_asset_id", id);
  const d = await db.from(table).delete().eq("id", id);
  if (d.error) throw new Error(d.error.message);
}
