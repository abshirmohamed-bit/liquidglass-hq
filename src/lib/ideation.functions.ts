import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const getIdeation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("ideation_threads")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data;
  });
export const createIdeationThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({ title: z.string().trim().min(1), clientId: z.string().uuid().nullable() }),
  )
  .handler(async ({ context, data }) => {
    const result = await context.supabase
      .from("ideation_threads")
      .insert({ owner_id: context.userId, title: data.title, client_id: data.clientId })
      .select()
      .single();
    if (result.error) throw new Error(result.error.message);
    return result.data;
  });
export const getIdeationThread = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    const thread = await context.supabase
      .from("ideation_threads")
      .select("*")
      .eq("id", data.id)
      .single();
    if (thread.error) throw new Error(thread.error.message);
    const result = await context.supabase
      .from("ideation_messages")
      .select("*")
      .eq("thread_id", data.id)
      .order("timestamp");
    if (result.error) throw new Error(result.error.message);
    const messages = result.data.map((row) => ({
      id: row.sdk_message_id || row.id,
      role: row.role === "user" ? "user" : "assistant",
      parts: Array.isArray(row.parts) ? row.parts : [{ type: "text", text: row.content || "" }],
    }));
    return { thread: thread.data, messagesJson: JSON.stringify(messages) };
  });
export const deleteIdeationThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    const result = await context.supabase.from("ideation_threads").delete().eq("id", data.id);
    if (result.error) throw new Error(result.error.message);
    return true;
  });
