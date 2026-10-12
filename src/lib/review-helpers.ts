import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { STORAGE_PREFIX } from "./review-rules";

type Db = SupabaseClient<Database>;
const WEEK = 7 * 86400;

/** storage://media/<path> → a signed https URL; other URLs pass through. */
export async function sign(db: Db, url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  if (!url.startsWith(STORAGE_PREFIX)) return url;
  const r = await db.storage.from("media").createSignedUrl(url.slice(STORAGE_PREFIX.length), WEEK);
  return r.data?.signedUrl ?? null;
}
export type Edits = { found?: { start_ms: number; end_ms: number }; trimmed?: boolean; segments?: { start_ms: number; end_ms: number }[]; exported?: { start_ms: number; end_ms: number }; export_started_at?: string; client_feedback?: string };
export const editsOf = (e: unknown): Edits => (e && typeof e === "object" ? (e as Edits) : {});
export function must<T>(r: { data: T; error: { message: string } | null }): NonNullable<T> { if (r.error) throw new Error(r.error.message); if (r.data == null) throw new Error("Not found"); return r.data; };

