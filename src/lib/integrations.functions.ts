import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { INTEGRATIONS, INTEGRATION_IDS, integrationStatus, type IntegrationId } from "./integration-rules";
import { ROLES } from "./roles";

type Ctx = { supabase: import("@supabase/supabase-js").SupabaseClient<import("@/integrations/supabase/types").Database>; userId: string };
const ids = z.enum(INTEGRATION_IDS);

async function workspace(ctx: Ctx) {
  const { data, error } = await ctx.supabase.rpc("workspace_of", { _uid: ctx.userId });
  if (error) throw new Error(error.message);
  return data as string;
}
async function assertAdmin(ctx: Ctx) {
  const { data, error } = await ctx.supabase.rpc("is_admin", { _user_id: ctx.userId });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Only admins can do this.");
}
async function setSetting(ctx: Ctx, key: string, value: unknown) {
  const owner = await workspace(ctx);
  const { error } = await ctx.supabase.from("app_settings").upsert({ owner_id: owner, key, value: JSON.stringify(value) }, { onConflict: "owner_id,key" });
  if (error) throw new Error(error.message);
}
const hasSecrets = (id: IntegrationId) => INTEGRATIONS.find((i) => i.id === id)!.secrets.every((s) => !!process.env[s]);

/** Reports only whether each secret exists and whether the last test succeeded — never a secret value. */
export const getIntegrations = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { data: admin } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
  if (!admin) return [];
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
  if (id === "engine") { const { engineClient } = await import("./engine.server"); const r = await engineClient("GET", "/v1/health"); if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`); return "Engine is healthy"; }
  if (id === "anthropic") { await check(fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": env("ANTHROPIC_API_KEY"), "anthropic-version": "2023-06-01", "content-type": "application/json" }, body: JSON.stringify({ model: "claude-3-5-haiku-latest", max_tokens: 5, messages: [{ role: "user", content: "Reply OK" }] }) })); return "Claude replied"; }
  if (id === "instagram" || id === "tiktok" || id === "x") return "Secret stored — live check runs once a channel is connected";
  if (id === "ai") { const { gatewayText } = await import("./training.server"); await gatewayText("Reply with OK.", "ping"); return "AI replied"; }
  if (id === "youtube") { await check(fetch(`https://www.googleapis.com/youtube/v3/channels?part=id&forHandle=YouTube&key=${env("YOUTUBE_API_KEY")}`)); return "Sample lookup worked"; }
  if (id === "discord") { const { listGuilds } = await import("./discord.server"); const g = await listGuilds(env("DISCORD_BOT_TOKEN")); return `Bot can read ${g.length} server(s)`; }
  if (id === "notion") { await check(fetch("https://api.notion.com/v1/users/me", { headers: { Authorization: `Bearer ${env("NOTION_API_KEY")}`, "Notion-Version": "2022-06-28" } })); return "Token accepted"; }
  const res = await fetch("https://platform.higgsfield.ai/requests/00000000-0000-0000-0000-000000000000/status", { headers: { Authorization: `Key ${env("HIGGSFIELD_API_KEY")}:${env("HIGGSFIELD_SECRET")}` } });
  if (res.status === 401 || res.status === 403) throw new Error(`Rejected (${res.status})`);
  return "Key accepted";
}

export const testIntegration = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(z.object({ id: ids })).handler(async ({ data, context }) => {
  await assertAdmin(context);
  const testedAt = new Date().toISOString();
  if (!hasSecrets(data.id)) { const message = "No key stored yet — follow the setup guide."; await setSetting(context, `integration:${data.id}`, { testedAt, ok: false, message }); return { ok: false, message }; }
  try { const message = await probe(data.id); await setSetting(context, `integration:${data.id}`, { testedAt, ok: true, message }); return { ok: true, message }; }
  catch (e) { const message = e instanceof Error ? e.message : "Test failed"; await setSetting(context, `integration:${data.id}`, { testedAt, ok: false, message }); return { ok: false, message }; }
});

export const disconnectIntegration = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(z.object({ id: ids })).handler(async ({ data, context }) => {
  await assertAdmin(context);
  await setSetting(context, `integration:${data.id}`, { disabled: true }); return true;
});

export const getEngineUrl = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  await assertAdmin(context);
  const { data } = await context.supabase.from("app_settings").select("value").eq("key", "ENGINE_URL").maybeSingle();
  try { return data?.value ? (JSON.parse(data.value) as string) : ""; } catch { return data?.value ?? ""; }
});
export const saveEngineUrl = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ url: z.union([z.literal(""), z.string().trim().url().max(500).refine((u) => u.startsWith("https://") || u.startsWith("http://"), "Must be an http(s) URL")]) }))
  .handler(async ({ data, context }) => { await assertAdmin(context); await setSetting(context, "ENGINE_URL", data.url.replace(/\/+$/, "")); return true; });

export const runDiscordSync = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  await assertAdmin(context);
  const token = process.env["DISCORD_BOT_TOKEN"];
  if (!token) throw new Error("Discord bot is not configured yet.");
  const owner = await workspace(context);
  const { syncDiscord } = await import("./discord.server");
  return syncDiscord(context.supabase, token, owner);
});

// ---- Team logins: invite-only users, created and role-managed by admins on the Team tab ----
const roleEnum = z.enum(ROLES);
export const listTeamLogins = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { data: admin } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
  if (!admin) return { isAdmin: false, logins: [] as { id: string; user_id: string; email: string; name: string; created_at: string; role: string; client_id: string | null }[] };
  const owner = await workspace(context);
  const { data, error } = await context.supabase.from("team_logins").select("id,user_id,email,name,created_at").eq("owner_id", owner).order("created_at");
  if (error) throw new Error(error.message);
  const { data: roles } = await context.supabase.from("user_roles").select("user_id,role,client_id");
  const byUser = new Map((roles ?? []).map((r) => [r.user_id, r]));
  return { isAdmin: true, logins: (data ?? []).map((l) => ({ ...l, role: byUser.get(l.user_id)?.role ?? "CLIPPER", client_id: byUser.get(l.user_id)?.client_id ?? null })) };
});
export const createTeamLogin = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ name: z.string().trim().min(1).max(100), email: z.string().trim().email().max(255), password: z.string().min(8).max(72), role: roleEnum.default("CLIPPER"), clientId: z.string().uuid().nullable().optional() }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.role === "CLIENT" && !data.clientId) throw new Error("Pick which client this login belongs to.");
    const owner = await workspace(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const created = await supabaseAdmin.auth.admin.createUser({ email: data.email, password: data.password, email_confirm: true, user_metadata: { full_name: data.name } });
    if (created.error || !created.data.user) throw new Error(created.error?.message ?? "Could not create login");
    const uid = created.data.user.id;
    const { error } = await supabaseAdmin.from("team_logins").insert({ owner_id: owner, user_id: uid, email: data.email, name: data.name });
    const roleErr = error ? null : (await supabaseAdmin.from("user_roles").upsert({ user_id: uid, role: data.role, client_id: data.role === "CLIENT" ? data.clientId ?? null : null }, { onConflict: "user_id" })).error;
    if (error || roleErr) { await supabaseAdmin.auth.admin.deleteUser(uid); throw new Error((error ?? roleErr)!.message); }
    await supabaseAdmin.from("audit_logs").insert({ owner_id: owner, user_id: context.userId, action: "user.create", entity: "user", entity_id: uid, details: { role: data.role } });
    return true;
  });
export const setTeamRole = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ userId: z.string().uuid(), role: roleEnum, clientId: z.string().uuid().nullable().optional() }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.userId === context.userId) throw new Error("You can't change your own role.");
    if (data.role === "CLIENT" && !data.clientId) throw new Error("Pick which client this login belongs to.");
    const owner = await workspace(context);
    const { data: row } = await context.supabase.from("team_logins").select("id").eq("user_id", data.userId).eq("owner_id", owner).maybeSingle();
    if (!row) throw new Error("Login not found");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("user_roles").upsert({ user_id: data.userId, role: data.role, client_id: data.role === "CLIENT" ? data.clientId ?? null : null }, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("audit_logs").insert({ owner_id: owner, user_id: context.userId, action: "user.role", entity: "user", entity_id: data.userId, details: { role: data.role } });
    return true;
  });
export const removeTeamLogin = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator(z.object({ id: z.string().uuid() })).handler(async ({ data, context }) => {
  await assertAdmin(context);
  const owner = await workspace(context);
  const { data: row, error } = await context.supabase.from("team_logins").select("user_id").eq("id", data.id).eq("owner_id", owner).single();
  if (error) throw new Error("Login not found");
  if (row.user_id === context.userId) throw new Error("You can't remove yourself.");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const del = await supabaseAdmin.auth.admin.deleteUser(row.user_id);
  if (del.error) throw new Error(del.error.message);
  return true;
});
