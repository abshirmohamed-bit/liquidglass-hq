export const STAGES = ["WAITING_FOR_FOOTAGE", "FILMING", "EDITING_SHORT_FORM", "EDITING_LONG_FORM", "DESIGNING_THUMBNAIL", "IN_REVIEW", "UPLOADING", "PUBLISHED"] as const;
export type Stage = (typeof STAGES)[number];

export type IntegrationId = "engine" | "ai" | "anthropic" | "higgsfield" | "youtube" | "instagram" | "tiktok" | "x" | "discord" | "notion";
export const INTEGRATION_IDS = ["engine", "ai", "anthropic", "higgsfield", "youtube", "instagram", "tiktok", "x", "discord", "notion"] as const;
export type GuideStep = { title: string; body: string; code?: string };
export type Integration = { id: IntegrationId; name: string; minutes: number; required?: boolean; optional?: boolean; intro: string; secrets: string[]; steps: GuideStep[]; /** true when the test only confirms the secret exists (no safe live call possible yet) */ presenceOnly?: boolean };

const addKey = (names: string): GuideStep => ({ title: "Store it securely", body: `Ask in the Lovable editor chat to add ${names}. A secure form opens; paste the value there. Keys are never stored in the app's settings or shown again.` });

/** Recommended order: AI first (required), then Higgsfield, YouTube, Discord, Notion. */
export const INTEGRATIONS: Integration[] = [
  { id: "engine", name: "crayZmundo Engine", minutes: 10, secrets: ["ENGINE_API_KEY", "ENGINE_WEBHOOK_SECRET"], intro: "crayZmundo’s own video processor for clipping, editing, rendering and transcription. Fly.io hosts its container; it is not a separate platform.",
    steps: [
      { title: "Deploy the Engine", body: "Deploy crayZmundo’s own container from engine/ to Fly.io using engine/DEPLOY.md." },
      { title: "Save the Engine URL", body: "Paste the Engine's base URL into the Engine URL field on this card and click Save. It is not a secret, so it is stored in settings." },
      addKey("ENGINE_API_KEY and ENGINE_WEBHOOK_SECRET"),
      { title: "Test", body: "Click Test Connection — it calls GET /v1/health on your Engine." },
    ] },
  { id: "ai", name: "Claude / AI API", minutes: 2, required: true, secrets: ["LOVABLE_API_KEY"], intro: "Set this up first — it powers ideation, thumbnails, channel analysis, and the Discord agent.",
    steps: [
      { title: "Check the AI connection", body: "This app uses the built-in AI service, which is already connected to your workspace. No key to paste." },
      { title: "Run the test", body: "Click Test Connection below. A green Connected badge means ideation, thumbnails, channel analysis and the Discord agent can use AI." },
    ] },
  { id: "anthropic", name: "Anthropic (Claude)", minutes: 3, secrets: ["ANTHROPIC_API_KEY"], intro: "The AI model API used for judgement calls.",
    steps: [
      { title: "Create a key", body: "Open the Anthropic console → API Keys → Create Key.", code: "https://console.anthropic.com/settings/keys" },
      addKey("ANTHROPIC_API_KEY"),
      { title: "Test", body: "Click Test Connection to send a one-word request." },
    ] },
  { id: "higgsfield", name: "Higgsfield (thumbnails)", minutes: 3, secrets: ["HIGGSFIELD_API_KEY", "HIGGSFIELD_SECRET"], intro: "Generates thumbnail images with nano-banana-pro.",
    steps: [
      { title: "Sign in to Higgsfield", body: "Open the Higgsfield platform and sign in.", code: "https://platform.higgsfield.ai" },
      { title: "Create an API key", body: "Go to API Keys → Create. Copy both the key and the secret — the secret is only shown once." },
      addKey("HIGGSFIELD_API_KEY and HIGGSFIELD_SECRET"),
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
  { id: "instagram", name: "Instagram", minutes: 10, presenceOnly: true, secrets: ["INSTAGRAM_APP_SECRET"], intro: "Posting to Instagram Reels (needs a Business account). Channels are connected in Prompt 7.",
    steps: [
      { title: "Create a Meta app", body: "Open Meta for Developers → My Apps → Create App, and add Instagram.", code: "https://developers.facebook.com/apps" },
      { title: "Copy the app secret", body: "App settings → Basic → App secret → Show." },
      addKey("INSTAGRAM_APP_SECRET"),
      { title: "Test", body: "Test confirms the secret is stored. A live check runs once a channel is connected." },
    ] },
  { id: "tiktok", name: "TikTok", minutes: 10, presenceOnly: true, secrets: ["TIKTOK_CLIENT_SECRET"], intro: "Posting to TikTok. Posts stay private until your app passes TikTok's audit.",
    steps: [
      { title: "Create a TikTok app", body: "Open TikTok for Developers → Manage apps → Connect an app.", code: "https://developers.tiktok.com/apps" },
      { title: "Copy the client secret", body: "App details → Client secret." },
      addKey("TIKTOK_CLIENT_SECRET"),
      { title: "Test", body: "Test confirms the secret is stored. A live check runs once a channel is connected." },
    ] },
  { id: "x", name: "X", minutes: 10, presenceOnly: true, secrets: ["X_CLIENT_SECRET"], intro: "Posting to X. X charges per post.",
    steps: [
      { title: "Create an X app", body: "Open the X developer portal → Projects & Apps → your app → Keys and tokens.", code: "https://developer.x.com/en/portal/dashboard" },
      { title: "Copy the OAuth 2.0 client secret", body: "User authentication settings → OAuth 2.0 Client ID and Client Secret." },
      addKey("X_CLIENT_SECRET"),
      { title: "Test", body: "Test confirms the secret is stored. A live check runs once a channel is connected." },
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
