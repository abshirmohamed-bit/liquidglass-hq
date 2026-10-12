import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { INTEGRATIONS, integrationStatus, type IntegrationId } from "./integration-rules";

type Ctx = { supabase: import("@supabase/supabase-js").SupabaseClient<import("@/integrations/supabase/types").Database>; userId: string };
const ids = z.enum(["ai", "higgsfield", "youtube", "discord", "notion"]);

async function workspace(ctx: Ctx) {
  const { data, error } = await ctx.supabase.rpc("workspace_of", { _uid: ctx.userId });
  if (error) throw new Error(error.message);
  return data as string;
}
async function setSetting(ctx: Ctx, key: string, value: unknown) {
  const owner = await workspace(ctx);
  const { error } = await ctx.supabase.from("app_settings").upsert({ owner_id: owner, key, value: JSON.stringify(value) }, { onConflict: "owner_id,key" });
  if (error) throw new Error(error.message);
}
const hasSecrets = (id: IntegrationId) => INTEGRATIONS.find((i) => i.id === id)!.secrets.every((s) => !!process.env[s]);

export const getIntegrations = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { data, error } = await context.supabase.from("app_settings").select("key,value").like("key", "integration:%");
  if (error) throw new Error(error.message);
  const meta = Object.fromEntries((data ?? []).map((r) => [r.key.slice(12), JSON.parse(r.value || "{}")])) as Record<string, { disabled?: boolean; testedAt?: string; ok?: boolean; message?: string }>;
  return INTEGRATIONS.map((i) => {
    const m = meta[i.id] ?? {};
    return { id: i.id, status: integrationStatus(hasSecrets(i.id), !!m.disabled, m.ok ?? null), testedAt: m.testedAt ?? null, message: m.message ?? null };
  });
});

async function probe(id: IntegrationId): Promise<string> {
  const env = (k: string) => process.env[k] ?? "";
  const check = async (r: Promise<Response>) => { const res = await r; if (!res.ok) throw new Error(`Rejected (${res.status}): ${(await res.text()).slice(0, 200)}`); return res; };
  if (id === "ai") { const { gatewayText } = await import("./training.server"); await gatewayText("Reply with OK.", "ping"); return "AI replied"; }
  if (id === "youtube") { await check(fetch(`https://www.googleapis.com/youtube/v3/channels?part=id&forHandle=YouTube&key=${env("YOUTUBE_API_KEY")}`)); return "Sample lookup worked"; }
  if (id === "discord") { const { listGuilds } = await import("./discord.server"); const g = await listGuilds(env("DISCORD_BOT_TOKEN")); return `Bot can read ${g.length} server(s)`; }
  if (id === "notion") { await check(fetch("https://api.notion.com/v1/users/me", { headers: { Authorization: `Bearer ${env("NOTION_API_KEY")}`, "Notion-Version": "2022-06-28" } })); return "Token accepted"; }
  const res = await fetch("https://platform.higgsfield.ai/requests/00000000-0000-0000-0000-000000000000/status", { headers: { Authorization: `Key ${env("HIGGSFIELD_API_KEY")}:${env("HIGGSFIELD_API_SECRET")}` } });
  if (res.status === 401 || res.status === 403) throw new Error(`Rejected (${res.status})`);
  return "Key accepted";
}

export const testIntegration = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(z.object({ id: ids })).handler(async ({ data, context }) => {
  const testedAt = new Date().toISOString();
  if (!hasSecrets(data.id)) { const message = "No key stored yet — follow the setup guide."; await setSetting(context, `integration:${data.id}`, { testedAt, ok: false, message }); return { ok: false, message }; }
  try { const message = await probe(data.id); await setSetting(context, `integration:${data.id}`, { testedAt, ok: true, message }); return { ok: true, message }; }
  catch (e) { const message = e instanceof Error ? e.message : "Test failed"; await setSetting(context, `integration:${data.id}`, { testedAt, ok: false, message }); return { ok: false, message }; }
});

export const disconnectIntegration = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(z.object({ id: ids })).handler(async ({ data, context }) => {
  await setSetting(context, `integration:${data.id}`, { disabled: true }); return true;
});

export const runDiscordSync = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const token = process.env["DISCORD_BOT_TOKEN"];
  if (!token) throw new Error("Discord bot is not configured yet.");
  const owner = await workspace(context);
  const { syncDiscord } = await import("./discord.server");
  return syncDiscord(context.supabase, token, owner);
});

// ---- Team logins (owner only) ----
async function assertOwner(ctx: Ctx) {
  const { data, error } = await ctx.supabase.from("team_logins").select("id").eq("user_id", ctx.userId).limit(1);
  if (error) throw new Error(error.message);
  if (data?.length) throw new Error("Only the agency owner can manage team logins.");
}
export const listTeamLogins = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { data, error } = await context.supabase.from("team_logins").select("id,user_id,email,name,created_at,owner_id").order("created_at");
  if (error) throw new Error(error.message);
  const member = (data ?? []).find((r) => r.user_id === context.userId);
  return { isOwner: !member, logins: member ? [] : data ?? [] };
});
export const createTeamLogin = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ name: z.string().trim().min(1).max(100), email: z.string().trim().email().max(255), password: z.string().min(8).max(72) }))
  .handler(async ({ data, context }) => {
    await assertOwner(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const created = await supabaseAdmin.auth.admin.createUser({ email: data.email, password: data.password, email_confirm: true, user_metadata: { full_name: data.name } });
    if (created.error || !created.data.user) throw new Error(created.error?.message ?? "Could not create login");
    const { error } = await supabaseAdmin.from("team_logins").insert({ owner_id: context.userId, user_id: created.data.user.id, email: data.email, name: data.name });
    if (error) { await supabaseAdmin.auth.admin.deleteUser(created.data.user.id); throw new Error(error.message); }
    return true;
  });
export const removeTeamLogin = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(z.object({ id: z.string().uuid() })).handler(async ({ data, context }) => {
  await assertOwner(context);
  const { data: row, error } = await context.supabase.from("team_logins").select("user_id").eq("id", data.id).eq("owner_id", context.userId).single();
  if (error) throw new Error("Login not found");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const del = await supabaseAdmin.auth.admin.deleteUser(row.user_id);
  if (del.error) throw new Error(del.error.message);
  return true;
});
