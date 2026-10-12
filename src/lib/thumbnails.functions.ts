import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { historyLine, validRating } from "./thumbnail-rules";

export const getThumbnailSessions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { higgsfieldCredentials } = await import("./thumbnails.server");
    const { data, error } = await context.supabase.from("thumbnail_sessions").select("*").order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { sessions: data, connected: !!higgsfieldCredentials() };
  });

export const getThumbnailMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    const r = await context.supabase.from("thumbnail_messages").select("*").eq("session_id", data.id).order("timestamp");
    if (r.error) throw new Error(r.error.message);
    return r.data;
  });

/** Saves the user message, asks the AI for creative direction (with knowledge + history) and saves its reply. */
export const sendThumbnailMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ sessionId: z.string().uuid().nullable(), clientId: z.string().uuid(), text: z.string().trim().min(1).max(4000) }))
  .handler(async ({ context, data }) => {
    const sb = context.supabase;
    const client = await sb.from("clients").select("name").eq("id", data.clientId).single();
    if (client.error) throw new Error("Choose a client first.");
    let sessionId = data.sessionId;
    if (!sessionId) {
      const s = await sb.from("thumbnail_sessions").insert({ client_id: data.clientId, title: data.text.slice(0, 80) }).select().single();
      if (s.error) throw new Error(s.error.message);
      sessionId = s.data.id;
    }
    const prior = await sb.from("thumbnail_messages").select("*").eq("session_id", sessionId).order("timestamp");
    if (prior.error) throw new Error(prior.error.message);
    const u = await sb.from("thumbnail_messages").insert({ session_id: sessionId, role: "user", content: data.text });
    if (u.error) throw new Error(u.error.message);
    const knowledge = await sb.from("knowledge_entries").select("learned_principle,user_input").eq("scope", "THUMBNAIL").is("client_id", null);
    const { planThumbnail } = await import("./thumbnails.server");
    const plan = await planThumbnail({
      history: prior.data.map((m) => `${m.role}: ${historyLine(m)}`),
      knowledge: (knowledge.data ?? []).map((k) => k.learned_principle || k.user_input || "").filter(Boolean),
      client: client.data.name,
      request: data.text,
    });
    const a = await sb.from("thumbnail_messages").insert({ session_id: sessionId, role: "assistant", content: plan.direction }).select().single();
    if (a.error) throw new Error(a.error.message);
    return { sessionId, imagePrompt: plan.image_prompt };
  });

export const generateThumbnail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ sessionId: z.string().uuid(), prompt: z.string().min(1).max(6000), variations: z.boolean() }))
  .handler(async ({ context, data }) => {
    const session = await context.supabase.from("thumbnail_sessions").select("id").eq("id", data.sessionId).single();
    if (session.error) throw new Error("Session not found.");
    const { higgsfieldCredentials, generateImages } = await import("./thumbnails.server");
    const creds = higgsfieldCredentials();
    if (!creds) return { connected: false as const };
    const urls = await generateImages(data.prompt, data.variations ? 3 : 1, creds);
    const tag = data.variations ? `variation:${crypto.randomUUID()}` : "image";
    const rows = urls.map((url) => ({ session_id: data.sessionId, role: "assistant", content: `${tag}\n${data.prompt}`.slice(0, 6000), image_url: url }));
    const r = await context.supabase.from("thumbnail_messages").insert(rows);
    if (r.error) throw new Error(r.error.message);
    return { connected: true as const };
  });

export const rateThumbnail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid(), rating: z.number().refine(validRating) }))
  .handler(async ({ context, data }) => {
    const r = await context.supabase.from("thumbnail_messages").update({ rating: data.rating }).eq("id", data.id).select("id").single();
    if (r.error) throw new Error(r.error.message);
    return true;
  });

/** Returns an owned image as a data URL so the overlay editor can draw and export it. */
export const loadThumbnailImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    const m = await context.supabase.from("thumbnail_messages").select("image_url").eq("id", data.id).single();
    if (m.error || !m.data.image_url) throw new Error("Image not found.");
    if (m.data.image_url.startsWith("data:")) return m.data.image_url;
    const res = await fetch(m.data.image_url);
    if (!res.ok) throw new Error("Could not load the image.");
    const buf = new Uint8Array(await res.arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return `data:${res.headers.get("content-type") || "image/jpeg"};base64,${btoa(bin)}`;
  });

export const saveOverlay = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ sessionId: z.string().uuid(), dataUrl: z.string().startsWith("data:image/jpeg;base64,").max(3_000_000) }))
  .handler(async ({ context, data }) => {
    const r = await context.supabase.from("thumbnail_messages").insert({ session_id: data.sessionId, role: "assistant", content: "image\nText overlay composite", image_url: data.dataUrl });
    if (r.error) throw new Error(r.error.message);
    return true;
  });
