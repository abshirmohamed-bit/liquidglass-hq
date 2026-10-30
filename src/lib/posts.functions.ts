import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { HEADLINE_RULES, HOOK_RULES } from "./copy-rules";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
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
  .inputValidator(z.object({ clipId: z.string().uuid(), scheduledAt: z.string().datetime().nullable(), items: z.array(z.object({ channelId: z.string().uuid(), caption: z.string().max(5000), title: z.string().max(200).optional(), hashtags: z.array(z.string().max(60)).max(30).optional(), tiktok: z.object({ privacy: z.enum(["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "FOLLOWER_OF_CREATOR", "SELF_ONLY"]), allowComment: z.boolean(), allowDuet: z.boolean(), allowStitch: z.boolean(), disclose: z.boolean(), yourBrand: z.boolean(), brandedContent: z.boolean() }).optional() })).min(1).max(20) }))
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
      if (ch.platform === "TIKTOK" && ch.status === "CONNECTED") {
        if (!it.tiktok) throw new Error("Choose who can see the TikTok post.");
        if (it.tiktok.brandedContent && it.tiktok.privacy === "SELF_ONLY") throw new Error("Branded content can't be private.");
        if (it.tiktok.disclose && !it.tiktok.yourBrand && !it.tiktok.brandedContent) throw new Error("Say what the TikTok promotes.");
      }
      return { privacy: it.tiktok?.privacy ?? null, platform_options: (it.tiktok ?? {}) as never, clip_id: clip.id, channel_id: ch.id, platform: ch.platform, caption: it.caption, title: it.title ?? null, hashtags: (it.hashtags ?? []) as never, scheduled_at: when, mode: ch.status === "CONNECTED" ? "AUTO" : "MANUAL", status: "QUEUED", created_by: context.userId, owner_id: context.userId };
    });
    const made = must(await db.from("posts").insert(rows).select("id,mode"));
    return { count: rows.length, autoIds: data.scheduledAt ? [] : made.filter((r) => r.mode === "AUTO").map((r) => r.id) };
  });

async function ownPost(db: SupabaseClient<Database>, id: string) {
  return must(await db.from("posts").select("id,status,mode").eq("id", id).single());
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

/**
 * The creator's standing instruction for how copy should read, if they set
 * one. They never write the words — the AI takes those from the clip — but
 * they can say what KIND of line it should be, once, for everything.
 *
 * brand_kits has carried `tone` and `copy_defaults` since the table was made
 * and nothing has ever read either of them.
 */
export async function savedBrief(
  db: SupabaseClient<Database>,
  which: "title" | "caption",
): Promise<string> {
  const kit = (await db.from("brand_kits").select("tone,copy_defaults").maybeSingle()).data;
  if (!kit) return "";
  const defaults = (kit.copy_defaults ?? {}) as Record<string, unknown>;
  const saved = defaults[which];
  if (typeof saved === "string" && saved.trim()) return saved.trim();
  // `tone` predates the split into two briefs; it only ever meant caption voice.
  return which === "caption" && typeof kit.tone === "string" ? kit.tone.trim() : "";
}

/** AI copy per platform from the clip title and transcript text, within each platform's limit. */
/**
 * Write the copy for one clip on the given platforms and store it on the clip.
 * Autopilot calls this directly; the server function below is the same thing
 * with the signed-in user's client.
 */
export async function writeCopyFor(
  db: SupabaseClient<Database>,
  clipId: string,
  platforms: Platform[],
  tone?: string,
): Promise<Record<string, string>> {
  const c = must(await db.from("clips").select("title,captions,watermark_text,copy").eq("id", clipId).single());
  const words = Array.isArray(c.captions) ? (c.captions as { text: string }[]).map((x) => x.text).join(" ").slice(0, 4000) : "";
  // The saved house style, when the caller did not pass one for this clip.
  const brief = tone?.trim() || (await savedBrief(db, "caption"));
  const { gatewayText } = await import("./training.server");
  const rules = platforms.map((p) => `${p}: max ${COPY_LIMITS[p]} chars${p === "YOUTUBE" ? " (title ending with #Shorts)" : p === "X" ? ", 1-2 hashtags, no links" : ", hook first, then 2 short lines, hashtags on the last line"}`).join("\n");
  const raw = await gatewayText(
    // A description is read while the video is already playing, by someone
    // deciding whether to stay. Opening with a summary of what they can
    // already see is the one thing guaranteed not to hold them.
    `You write short-form social captions. The first line is a hook. ${HOOK_RULES} Reply with JSON only: an object whose keys are the platform names given and whose values are the caption strings.`,
    `Clip title: ${c.title ?? ""}\nHandle: ${c.watermark_text ?? ""}\nHow the creator wants captions written: ${brief || "punchy, natural"}\nWhat is said: ${words || "(no transcript)"}\nPlatforms and rules:\n${rules}`,
  );
  let out: Record<string, string> = {};
  try { out = JSON.parse(raw.replace(/^```(json)?|```$/g, "").trim()) as Record<string, string>; } catch { throw new Error("The AI reply couldn't be read. Try again."); }
  const copy: Record<string, string> = {};
  for (const p of platforms) if (typeof out[p] === "string") copy[p] = out[p]!.slice(0, COPY_LIMITS[p]);
  await db.from("clips").update({ copy: { ...((c.copy as object) ?? {}), ...copy } as never }).eq("id", clipId);
  return copy;
}

export const writeCopy = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ clipId: z.string().uuid(), platforms: z.array(z.enum(PLATFORMS)).min(1).max(6), tone: z.string().max(200).optional() }))
  .handler(async ({ context, data }) => writeCopyFor(context.supabase, data.clipId, data.platforms as Platform[], data.tone));


/**
 * Rewrite one clip's headline to order.
 *
 * The AI already wrote one when the clip was cut; this is for the times a
 * creator wants that particular clip to say something else — "lead on the
 * number", "make it about the question he dodged". They say what it should
 * get at, not the words themselves, and the line still comes from what the
 * clip actually says.
 *
 * It hands the line back rather than saving it, so a rewrite that misses can
 * simply be ignored.
 */
export async function rewriteHeadlineFor(
  db: SupabaseClient<Database>,
  clipId: string,
  instruction: string,
): Promise<string> {
  const c = must(await db.from("clips").select("title,captions").eq("id", clipId).single());
  const words = Array.isArray(c.captions)
    ? (c.captions as { text: string }[]).map((x) => x.text).join(" ").slice(0, 4000)
    : "";
  if (!words) throw new Error("This clip has no transcript yet, so there is nothing to write from.");
  const brief = instruction.trim() || (await savedBrief(db, "title"));
  const { gatewayText } = await import("./training.server");
  const line = await gatewayText(
    `You write the headline burned onto a short video. ${HEADLINE_RULES} Reply with the headline alone — no quotes, no preamble, no options.`,
    `What is said in the clip: ${words}\nThe headline now: ${c.title ?? "(none)"}\nWhat the creator wants this one to do: ${brief || "find the strongest hook in it"}`,
  );
  const out = (line.trim().split("\n")[0] ?? "").replace(/^["'\u201c\u2018]+|["'\u201d\u2019]+$/g, "").trim();
  if (!out) throw new Error("The AI reply couldn't be read. Try again.");
  return out.slice(0, 140);
}

export const rewriteHeadline = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ clipId: z.string().uuid(), instruction: z.string().trim().max(300) }))
  .handler(async ({ context, data }) => rewriteHeadlineFor(context.supabase, data.clipId, data.instruction));
