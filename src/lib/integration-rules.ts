export const STAGES = ["WAITING_FOR_FOOTAGE", "FILMING", "EDITING_SHORT_FORM", "EDITING_LONG_FORM", "DESIGNING_THUMBNAIL", "IN_REVIEW", "UPLOADING", "PUBLISHED"] as const;
export type Stage = (typeof STAGES)[number];

export type IntegrationId = "ai" | "higgsfield" | "youtube" | "discord" | "notion";
export type GuideStep = { title: string; body: string; code?: string };
export type Integration = { id: IntegrationId; name: string; minutes: number; required?: boolean; optional?: boolean; intro: string; secrets: string[]; steps: GuideStep[] };

const addKey = (names: string): GuideStep => ({ title: "Store it securely", body: `Ask in the Lovable editor chat to add ${names}. A secure form opens; paste the value there. Keys are never stored in the app's settings or shown again.` });

/** Recommended order: AI first (required), then Higgsfield, YouTube, Discord, Notion. */
export const INTEGRATIONS: Integration[] = [
  { id: "ai", name: "Claude / AI API", minutes: 2, required: true, secrets: ["LOVABLE_API_KEY"], intro: "Set this up first — it powers ideation, thumbnails, channel analysis, and the Discord agent.",
    steps: [
      { title: "Check the AI connection", body: "This app uses the built-in AI service, which is already connected to your workspace. No key to paste." },
      { title: "Run the test", body: "Click Test Connection below. A green Connected badge means ideation, thumbnails, channel analysis and the Discord agent can use AI." },
    ] },
  { id: "higgsfield", name: "Higgsfield (thumbnails)", minutes: 3, secrets: ["HIGGSFIELD_API_KEY", "HIGGSFIELD_API_SECRET"], intro: "Generates thumbnail images with nano-banana-pro.",
    steps: [
      { title: "Sign in to Higgsfield", body: "Open the Higgsfield platform and sign in.", code: "https://platform.higgsfield.ai" },
      { title: "Create an API key", body: "Go to API Keys → Create. Copy both the key and the secret — the secret is only shown once." },
      addKey("HIGGSFIELD_API_KEY and HIGGSFIELD_API_SECRET"),
      { title: "Test", body: "Click Test Connection to confirm the key is accepted." },
    ] },
  { id: "youtube", name: "YouTube Data API", minutes: 5, secrets: ["YOUTUBE_API_KEY"], intro: "Powers channel analysis, suggested titles and live analytics.",
    steps: [
      { title: "Open Google Cloud Console", body: "Create or pick a project.", code: "https://console.cloud.google.com" },
      { title: "Enable the API", body: "APIs & Services → Library → search for this API and click Enable.", code: "YouTube Data API v3" },
      { title: "Create an API key", body: "APIs & Services → Credentials → Create credentials → API key. It usually starts with AIza." },
      addKey("YOUTUBE_API_KEY"),
      { title: "Test", body: "Click Test Connection to run a sample lookup." },
    ] },
  { id: "discord", name: "Discord bot", minutes: 5, secrets: ["DISCORD_BOT_TOKEN"], intro: "Reads team messages (read-only) to track each client's production stage.",
    steps: [
      { title: "Create an application", body: "Open the Discord Developer Portal → New Application.", code: "https://discord.com/developers/applications" },
      { title: "Enable MESSAGE CONTENT INTENT", body: "Bot tab → Privileged Gateway Intents → turn on MESSAGE CONTENT INTENT → Save." },
      { title: "Copy the bot token", body: "Bot tab → Reset Token → copy it." },
      { title: "Invite with read-only permissions", body: "OAuth2 → URL Generator → scope 'bot' → permissions View Channels and Read Message History only. Open the link and add the bot to each client's server.", code: "permissions=66560" },
      { title: "Name servers after clients", body: "Each Discord server name must match the client's name in crayZmundo — that's how messages are matched." },
      addKey("DISCORD_BOT_TOKEN"),
      { title: "Test", body: "Click Test Connection to list the servers the bot can read." },
    ] },
  { id: "notion", name: "Notion", minutes: 4, optional: true, secrets: ["NOTION_API_KEY"], intro: "Optional. Lets the app read your Notion workspace.",
    steps: [
      { title: "Create an integration", body: "Open Notion integrations → New integration → Internal.", code: "https://www.notion.so/my-integrations" },
      { title: "Copy the token", body: "Copy the Internal Integration Secret (starts with ntn_ or secret_)." },
      { title: "Share pages", body: "In Notion, open each page → ••• → Connections → add your integration." },
      addKey("NOTION_API_KEY"),
      { title: "Test", body: "Click Test Connection to confirm the token works." },
    ] },
];

export const integrationFor = (id: IntegrationId) => INTEGRATIONS.find((i) => i.id === id)!;

export type IntegrationStatus = "CONNECTED" | "NOT_CONFIGURED" | "ERROR";
export function integrationStatus(hasSecrets: boolean, disabled: boolean, lastTestOk: boolean | null): IntegrationStatus {
  if (!hasSecrets || disabled) return "NOT_CONFIGURED";
  return lastTestOk === false ? "ERROR" : "CONNECTED";
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
/** Match a Discord server to a client by name (case/punctuation-insensitive). */
export function matchClientByServerName<T extends { name: string }>(serverName: string, clients: readonly T[]): T | undefined {
  const n = norm(serverName);
  return n ? clients.find((c) => norm(c.name) === n) : undefined;
}

/** Extract any of the eight stages from an AI reply; the first stage name mentioned wins. */
export function parseStage(reply: string): Stage | null {
  const up = reply.toUpperCase();
  let best: { s: Stage; i: number } | null = null;
  for (const s of STAGES) {
    const i = up.search(new RegExp(`\\b${s}\\b`));
    if (i >= 0 && (!best || i < best.i)) best = { s, i };
  }
  return best?.s ?? null;
}

export const DISCORD_PROMPT = "Based on these team Discord messages, determine the current production stage for this client. Stages: WAITING_FOR_FOOTAGE, FILMING, EDITING_SHORT_FORM, EDITING_LONG_FORM, DESIGNING_THUMBNAIL, IN_REVIEW, UPLOADING, PUBLISHED. Return only the stage name and brief reasoning.";
