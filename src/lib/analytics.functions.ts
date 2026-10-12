import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { channelUrlFrom } from "./analytics-rules";

export const youtubeStatus = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async () => ({ connected: !!process.env["YOUTUBE_API_KEY"] }));

export const connectChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ clientId: z.string().uuid(), channel: z.string().trim().min(2).max(300) }))
  .handler(async ({ context, data }) => {
    const r = await context.supabase.from("clients").update({ channel_url: channelUrlFrom(data.channel) }).eq("id", data.clientId);
    if (r.error) throw new Error(r.error.message);
    return true;
  });

export const pullYouTube = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ clientId: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    const key = process.env["YOUTUBE_API_KEY"];
    if (!key) throw new Error("YouTube is not connected yet. Add a manual snapshot instead.");
    const c = await context.supabase.from("clients").select("channel_url").eq("id", data.clientId).single();
    if (c.error) throw new Error(c.error.message);
    if (!c.data.channel_url) throw new Error("Connect this client's channel first.");
    const url = new URL(c.data.channel_url);
    const parts = url.pathname.split("/").filter(Boolean);
    const sel = parts[0] === "channel" ? { id: parts[1] ?? "" } : { forHandle: parts[0] ?? "" };
    const yt = async (path: string, p: Record<string, string>) => {
      const res = await fetch(`https://www.googleapis.com/youtube/v3/${path}?${new URLSearchParams({ ...p, key })}`);
      if (!res.ok) throw new Error(`YouTube could not be reached (${res.status}).`);
      return res.json();
    };
    const ch = (await yt("channels", { part: "statistics,contentDetails", ...sel })).items?.[0];
    if (!ch) throw new Error("Channel not found.");
    const list = await yt("playlistItems", { part: "contentDetails", playlistId: ch.contentDetails.relatedPlaylists.uploads, maxResults: "50" });
    const ids = (list.items || []).map((i: { contentDetails: { videoId: string } }) => i.contentDetails.videoId).join(",");
    const vids = ids ? await yt("videos", { part: "snippet,statistics", id: ids }) : { items: [] };
    const top = (vids.items || []).map((v: { snippet: { title: string }; statistics: { viewCount?: string } }) => ({ title: v.snippet.title, views: Number(v.statistics.viewCount || 0) }))
      .sort((a: { views: number }, b: { views: number }) => b.views - a.views).slice(0, 5);
    const r = await context.supabase.from("analytics_snapshots").insert({
      client_id: data.clientId, date: new Date().toISOString().slice(0, 10),
      views: Number(ch.statistics.viewCount || 0), subscribers: Number(ch.statistics.subscriberCount || 0), top_videos: top,
    });
    if (r.error) throw new Error(r.error.message);
    return true;
  });

const num = z.number().min(0).nullable();
export const addSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ client_id: z.string().uuid(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), views: num, subscribers: num, watch_hours: num, impressions_ctr: z.number().min(0).max(100).nullable(),
    top_videos: z.array(z.object({ title: z.string().trim().min(1).max(300), views: z.number().min(0) })).max(10) }))
  .handler(async ({ context, data }) => {
    const r = await context.supabase.from("analytics_snapshots").insert(data);
    if (r.error) throw new Error(r.error.message);
    return true;
  });

export const deleteSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    const r = await context.supabase.from("analytics_snapshots").delete().eq("id", data.id);
    if (r.error) throw new Error(r.error.message);
    return true;
  });
