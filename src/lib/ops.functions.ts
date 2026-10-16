import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { LEAD_STATUSES } from "./ops-rules";

const id = z.object({ id: z.string().uuid() });
const fail = (e: { message: string } | null) => { if (e) throw new Error(e.message); };

export const getOps = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const [leads, objectives] = await Promise.all([
    context.supabase.from("leads").select("*").order("name"),
    context.supabase.from("daily_objectives").select("*").order("created_at"),
  ]);
  fail(leads.error); fail(objectives.error);
  return { leads: leads.data ?? [], objectives: objectives.data ?? [] };
});

export const setPaymentCollected = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(id.extend({ collected: z.boolean() }))
  .handler(async ({ context, data }) => {
    const r = await context.supabase.from("payments").update(data.collected ? { status: "PAID", paid_date: new Date().toISOString().slice(0, 10) } : { status: "PENDING", paid_date: null }).eq("id", data.id);
    fail(r.error); return true;
  });

const member = z.object({ id: z.string().uuid().optional(), client_id: z.string().uuid(), name: z.string().trim().min(1).max(120), role: z.enum(["CHANNEL_MANAGER", "SHORT_FORM_EDITOR", "LONG_FORM_EDITOR", "THUMBNAIL_DESIGNER"]), cost: z.number().min(0).max(1_000_000) });
export const saveTeamMember = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(member).handler(async ({ context, data }) => {
  const { id: rowId, ...f } = data;
  const r = rowId ? await context.supabase.from("team_members").update(f).eq("id", rowId) : await context.supabase.from("team_members").insert(f);
  fail(r.error); return true;
});
export const deleteTeamMember = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(id).handler(async ({ context, data }) => {
  fail((await context.supabase.from("team_members").delete().eq("id", data.id)).error); return true;
});

const lead = z.object({ id: z.string().uuid().optional(), name: z.string().trim().min(1).max(120), channel_url: z.string().trim().max(300), notes: z.string().max(5000), status: z.enum(LEAD_STATUSES), upfront_cash: z.number().min(0), monthly_recurring: z.number().min(0) });
export const saveLead = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(lead).handler(async ({ context, data }) => {
  const { id: rowId, ...f } = data;
  const r = rowId ? await context.supabase.from("leads").update(f).eq("id", rowId) : await context.supabase.from("leads").insert({ ...f, owner_id: context.userId });
  fail(r.error); return true;
});
export const deleteLead = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(id).handler(async ({ context, data }) => {
  fail((await context.supabase.from("leads").delete().eq("id", data.id)).error); return true;
});

export const addObjective = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(z.object({ text: z.string().trim().min(1).max(500), day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })).handler(async ({ context, data }) => {
  fail((await context.supabase.from("daily_objectives").insert({ ...data, owner_id: context.userId })).error); return true;
});
export const toggleObjective = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(id.extend({ done: z.boolean() })).handler(async ({ context, data }) => {
  fail((await context.supabase.from("daily_objectives").update({ done: data.done }).eq("id", data.id)).error); return true;
});
export const deleteObjective = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(id).handler(async ({ context, data }) => {
  fail((await context.supabase.from("daily_objectives").delete().eq("id", data.id)).error); return true;
});

/**
 * Counts for the dashboard pipeline strip: where work is sitting right now,
 * from sources waiting to clips already posted. Read-only; RLS scopes the rows.
 */
export const pipelineCounts = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const db = context.supabase;
  const n = (r: { error: unknown; count: number | null }) => (r.error ? 0 : (r.count ?? 0));
  const head = { count: "exact", head: true } as const;
  const [sources, clipping, review, ready, scheduled, posted] = await Promise.all([
    db.from("source_assets").select("id", head).eq("status", "READY").is("trashed_at", null).then(n),
    db.from("clip_jobs").select("id", head).in("status", ["QUEUED", "PROCESSING", "AWAITING_CONFIRMATION"]).then(n),
    db.from("clips").select("id", head).eq("status", "FOUND").then(n),
    db.from("clips").select("id", head).eq("status", "READY").then(n),
    db.from("posts").select("id", head).in("status", ["QUEUED", "AWAITING_MANUAL"]).then(n),
    db.from("posts").select("id", head).eq("status", "POSTED").then(n),
  ]);
  return { sources, clipping, review, ready, scheduled, posted };
});
