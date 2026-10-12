import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { sign, must } from "./review-helpers";
import { COPY_LIMITS, copyIssue, type Platform } from "./finish-rules";

const PLATFORMS = ["INSTAGRAM", "YOUTUBE", "TIKTOK", "X", "FACEBOOK", "LINKEDIN"] as const;

export const postsData = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const db = context.supabase;
  const [posts, channels, clips] = await Promise.all([
    db.from("posts").select("*").order("scheduled_at", { ascending: true }),
    db.from("channels").select("*").order("created_at"),
    db.from("clips").select("id,title,thumbnail_url,video_url,status,duration_ms,aspect,watermark_text").eq("status", "READY").order("created_at", { ascending: false }).limit(300),
  ]);
  const ready = await Promise.all(must(clips).map(async (c) => ({ ...c, video_url: await sign(db, c.video_url), thumbnail_url: await sign(db, c.thumbnail_url) })));
  return { posts: must(posts), channels: must(channels), clips: ready };
});

export const addManualChannel = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ platform: z.enum(PLATFORMS), handle: z.string().trim().min(1).max(80) }))
  .handler(async ({ context, data }) => {
    must(await context.supabase.from("channels").insert({ platform: data.platform, handle: data.handle.startsWith("@") ? data.handle : `@${data.handle}`, status: "MANUAL", user_id: context.userId, owner_id: context.userId }).select("id").single());
    return true;
  });

export const removeChannel = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ context, data }) => { must(await context.supabase.from("channels").delete().eq("id", data.id).select("id")); return true; });

/** Confirm in the Distribute modal: one Post row per channel, QUEUED, AUTO for API-connected channels and MANUAL otherwise. */
export const queuePosts = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ clipId: z.string().uuid(), scheduledAt: z.string().datetime().nullable(), items: z.array(z.object({ channelId: z.string().uuid(), caption: z.string().max(5000), title: z.string().max(200).optional(), hashtags: z.array(z.string().max(60)).max(30).optional() })).min(1).max(20) }))
  .handler(async ({ context, data }) => {
    const db = context.supabase;
    const clip = must(await db.from("clips").select("id,status,video_url").eq("id", data.clipId).single());
    if (clip.status !== "READY" || !clip.video_url) throw new Error("Export the clip before posting it.");
    const chans = must(await db.from("channels").select("id,platform,status").in("id", data.items.map((i) => i.channelId)));
    const when = data.scheduledAt ?? new Date().toISOString();
    const rows = data.items.map((it) => {
      const ch = chans.find((c) => c.id === it.channelId);
      if (!ch) throw new Error("A selected channel no longer exists.");
      const issue = copyIssue(ch.platform as Platform, ch.platform === "YOUTUBE" ? it.title ?? it.caption : it.caption);
      if (issue) throw new Error(issue);
      return { clip_id: clip.id, channel_id: ch.id, platform: ch.platform, caption: it.caption, title: it.title ?? null, hashtags: (it.hashtags ?? []) as never, scheduled_at: when, mode: ch.status === "CONNECTED" ? "AUTO" : "MANUAL", status: "QUEUED", created_by: context.userId, owner_id: context.userId };
    });
    must(await db.from("posts").insert(rows).select("id"));
    return rows.length;
  });

async function ownPost(db: Parameters<Parameters<ReturnType<typeof createServerFn>["handler"]>[0]>[0] extends never ? never : any, id: string) {
  return must(await db.from("posts").select("id,status,mode").eq("id", id).single()) as { id: string; status: string; mode: string };
}

/** Manual flow: the person posted it themselves and pastes the link. Status changes go through the service client after RLS confirmed the row is theirs. */
export const resolveManualPost = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid(), action: z.enum(["POSTED", "SKIPPED", "RETRY", "MANUAL"]), url: z.string().url().max(500).optional(), reason: z.string().max(300).optional() }))
  .handler(async ({ context, data }) => {
    await ownPost(context.supabase, data.id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch = data.action === "POSTED" ? { status: "POSTED", post_url: data.url ?? null, posted_at: new Date().toISOString(), last_error: null }
      : data.action === "SKIPPED" ? { status: "SKIPPED", last_error: data.reason ?? "Skipped" }
      : data.action === "MANUAL" ? { status: "QUEUED", mode: "MANUAL", last_error: null }
      : { status: "QUEUED", attempts: 0, last_error: null };
    if (data.action === "POSTED" && !data.url) throw new Error("Paste the post link first.");
    must(await supabaseAdmin.from("posts").update(patch).eq("id", data.id).select("id").single());
    return true;
  });

export const cancelPost = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    const p = await ownPost(context.supabase, data.id);
    if (p.status !== "QUEUED") throw new Error("Only queued posts can be cancelled.");
    must(await context.supabase.from("posts").delete().eq("id", data.id).select("id"));
    return true;
  });

export const reschedulePost = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid(), scheduledAt: z.string().datetime() }))
  .handler(async ({ context, data }) => { must(await context.supabase.from("posts").update({ scheduled_at: data.scheduledAt }).eq("id", data.id).eq("status", "QUEUED").select("id").single()); return true; });

/** AI copy per platform from the clip title and transcript text, within each platform's limit. */
export const writeCopy = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ clipId: z.string().uuid(), platforms: z.array(z.enum(PLATFORMS)).min(1).max(6), tone: z.string().max(200).optional() }))
  .handler(async ({ context, data }) => {
    const c = must(await context.supabase.from("clips").select("title,captions,watermark_text,copy").eq("id", data.clipId).single());
    const words = Array.isArray(c.captions) ? (c.captions as { text: string }[]).map((x) => x.text).join(" ").slice(0, 4000) : "";
    const { gatewayText } = await import("./training.server");
    const rules = data.platforms.map((p) => `${p}: max ${COPY_LIMITS[p]} chars${p === "YOUTUBE" ? " (title ending with #Shorts)" : p === "X" ? ", 1-2 hashtags, no links" : ", hook first, then 2 short lines, hashtags on the last line"}`).join("\n");
    const raw = await gatewayText(
      "You write short-form social captions. Reply with JSON only: an object whose keys are the platform names given and whose values are the caption strings.",
      `Clip title: ${c.title ?? ""}\nHandle: ${c.watermark_text ?? ""}\nTone: ${data.tone || "punchy, natural"}\nWhat is said: ${words || "(no transcript)"}\nPlatforms and rules:\n${rules}`,
    );
    let out: Record<string, string> = {};
    try { out = JSON.parse(raw.replace(/^```(json)?|```$/g, "").trim()) as Record<string, string>; } catch { throw new Error("The AI reply couldn't be read. Try again."); }
    const copy: Record<string, string> = {};
    for (const p of data.platforms) if (typeof out[p] === "string") copy[p] = out[p]!.slice(0, COPY_LIMITS[p]);
    await context.supabase.from("clips").update({ copy: { ...((c.copy as object) ?? {}), ...copy } as never }).eq("id", data.clipId);
    return copy;
  });
