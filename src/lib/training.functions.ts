import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { EXTRACT_CHARS, MAX_TRAINING_CHARS, knowledgeScope } from "./training-rules";

const kind = z.enum(["THUMBNAIL", "VIDEO"]);
const target = z.object({ kind, clientId: z.string().uuid().nullable() });
const topic = (k: "THUMBNAIL" | "VIDEO") => (k === "THUMBNAIL" ? "YouTube thumbnail design" : "YouTube video and content ideation");

export const listKnowledge = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(target)
  .handler(async ({ context, data }) => {
    let q = context.supabase.from("knowledge_entries").select("*").eq("scope", knowledgeScope(data.kind, data.clientId)).order("timestamp");
    q = data.clientId ? q.eq("client_id", data.clientId) : q.is("client_id", null);
    const r = await q;
    if (r.error) throw new Error(r.error.message);
    return r.data;
  });

export const trainKnowledge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(target.extend({ input: z.string().trim().min(1).max(MAX_TRAINING_CHARS) }))
  .handler(async ({ context, data }) => {
    const { gatewayText } = await import("./training.server");
    const principle = await gatewayText(
      `You are being trained on ${topic(data.kind)}. The user shares examples, principles, references or explanations. Reply confirming what you learned, then restate the extracted principle(s) as concise, reusable rules. Start with "Learned:".`,
      data.input.slice(0, EXTRACT_CHARS),
    );
    const r = await context.supabase
      .from("knowledge_entries")
      .insert({ owner_id: context.userId, scope: knowledgeScope(data.kind, data.clientId), client_id: data.clientId, user_input: data.input, learned_principle: principle })
      .select()
      .single();
    if (r.error) throw new Error(r.error.message);
    return r.data;
  });

export const updateKnowledge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid(), user_input: z.string().max(MAX_TRAINING_CHARS), learned_principle: z.string().trim().min(1).max(100_000) }))
  .handler(async ({ context, data }) => {
    const { id, ...fields } = data;
    const r = await context.supabase.from("knowledge_entries").update(fields).eq("id", id).select("id").single();
    if (r.error) throw new Error(r.error.message);
    return true;
  });

export const deleteKnowledge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    const r = await context.supabase.from("knowledge_entries").delete().eq("id", data.id);
    if (r.error) throw new Error(r.error.message);
    return true;
  });

export const resetKnowledge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(target)
  .handler(async ({ context, data }) => {
    let q = context.supabase.from("knowledge_entries").delete().eq("scope", knowledgeScope(data.kind, data.clientId));
    q = data.clientId ? q.eq("client_id", data.clientId) : q.is("client_id", null);
    const r = await q;
    if (r.error) throw new Error(r.error.message);
    return true;
  });

export const summarizeKnowledge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(target)
  .handler(async ({ context, data }) => {
    let q = context.supabase.from("knowledge_entries").select("learned_principle").eq("scope", knowledgeScope(data.kind, data.clientId));
    q = data.clientId ? q.eq("client_id", data.clientId) : q.is("client_id", null);
    const r = await q;
    if (r.error) throw new Error(r.error.message);
    if (!r.data.length) return "No knowledge has been trained yet.";
    const { gatewayText } = await import("./training.server");
    return gatewayText(
      `Summarize all trained ${topic(data.kind)} knowledge into a clean summary grouped by topic with markdown headings (e.g. ${data.kind === "THUMBNAIL" ? "Composition, Color theory, Text rules, Emotional triggers" : "Titles, Hooks, Content angles, Growth strategy"}). Merge duplicates; keep every distinct rule.`,
      r.data.map((e) => `- ${e.learned_principle}`).join("\n"),
    );
  });
