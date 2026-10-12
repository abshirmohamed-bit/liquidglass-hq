import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { DISCORD_PROMPT, matchClientByServerName, parseStage } from "./integration-rules";
import { gatewayText } from "./training.server";

const API = "https://discord.com/api/v10";
async function dc<T>(path: string, token: string): Promise<T> {
  const r = await fetch(API + path, { headers: { Authorization: `Bot ${token}` } });
  if (!r.ok) throw new Error(`Discord request failed [${r.status}]: ${await r.text()}`);
  return r.json() as Promise<T>;
}
export const listGuilds = (token: string) => dc<{ id: string; name: string }[]>("/users/@me/guilds", token);

/** Read-only: reads recent messages, never sends. Writes ClientProgress with source AI_DISCORD. */
export async function syncDiscord(db: SupabaseClient<Database>, token: string, ownerId?: string) {
  const guilds = await listGuilds(token);
  let q = db.from("clients").select("id,name,owner_id").eq("status", "ACTIVE");
  if (ownerId) q = q.eq("owner_id", ownerId);
  const { data: clients, error } = await q;
  if (error) throw new Error(error.message);
  const results: { client: string; stage: string | null; note: string }[] = [];
  const since = Date.now() - 7 * 864e5;
  for (const g of guilds) {
    const client = matchClientByServerName(g.name, clients ?? []);
    if (!client) continue;
    const channels = await dc<{ id: string; name: string; type: number }[]>(`/guilds/${g.id}/channels`, token);
    const lines: string[] = [];
    for (const ch of channels.filter((c) => c.type === 0).slice(0, 10)) {
      try {
        const msgs = await dc<{ content: string; timestamp: string; author: { username: string } }[]>(`/channels/${ch.id}/messages?limit=50`, token);
        for (const m of msgs) if (m.content && Date.parse(m.timestamp) >= since) lines.push(`[${m.timestamp}] #${ch.name} ${m.author.username}: ${m.content}`);
      } catch { /* channel not readable */ }
    }
    if (!lines.length) { results.push({ client: client.name, stage: null, note: "No recent messages" }); continue; }
    lines.sort();
    const reply = await gatewayText(DISCORD_PROMPT, `Client: ${client.name}\n\n${lines.slice(-200).join("\n").slice(0, 60000)}`);
    const stage = parseStage(reply);
    if (!stage) { results.push({ client: client.name, stage: null, note: "AI gave no stage" }); continue; }
    const notes = reply.slice(0, 1000);
    const { data: existing } = await db.from("client_progress").select("id").eq("client_id", client.id).limit(1);
    const row = { stage, source: "AI_DISCORD", notes, updated_at: new Date().toISOString() };
    const w = existing?.[0] ? await db.from("client_progress").update(row).eq("id", existing[0].id) : await db.from("client_progress").insert({ ...row, client_id: client.id });
    if (w.error) throw new Error(w.error.message);
    results.push({ client: client.name, stage, note: notes });
  }
  return { servers: guilds.length, results };
}
