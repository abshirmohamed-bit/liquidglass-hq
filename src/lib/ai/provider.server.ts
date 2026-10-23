/**
 * The one place crayZmundo learns which AI provider to call.
 * Any OpenAI-compatible provider works: OpenAI, Google Gemini, Anthropic,
 * OpenRouter, Groq, Together, DeepSeek, Mistral, xAI, a local server, etc.
 *   AI_API_KEY           (secret, required)
 *   AI_BASE_URL          (default OpenAI)
 *   AI_MODEL             (chat model name for that provider)
 *   AI_TRANSCRIBE_MODEL  (speech-to-text model; default whisper-1)
 */
export type AiConfig = { apiKey: string; baseURL: string; model: string; transcribeModel: string };

export function aiConfig(): AiConfig | null {
  const apiKey = process.env["AI_API_KEY"];
  if (!apiKey) return null;
  const p = detectProvider(apiKey);
  const rawBase = (process.env["AI_BASE_URL"] || "").trim();
  const baseURL = (/^https?:\/\//.test(rawBase) ? rawBase : p.baseURL).replace(/\/+$/, "");
  const rawModel = (process.env["AI_MODEL"] || "").trim();
  return {
    apiKey,
    baseURL,
    model: looksLikeModel(rawModel) ? rawModel : p.model,
    transcribeModel: process.env["AI_TRANSCRIBE_MODEL"] || "whisper-1",
  };
}

/** Guess the provider from the key's prefix so only the key is strictly needed. Cheapest capable model per provider. */
export function detectProvider(key: string): { name: string; baseURL: string; model: string } {
  if (key.startsWith("ci_live_")) return { name: "Cheaper Inference", baseURL: "https://api.cheaperinference.com/v1", model: "gpt-5.4-mini" };
  if (key.startsWith("sk-ant-")) return { name: "Anthropic", baseURL: "https://api.anthropic.com/v1", model: "claude-haiku-4-5" };
  if (key.startsWith("sk-or-")) return { name: "OpenRouter", baseURL: "https://openrouter.ai/api/v1", model: "openai/gpt-4o-mini" };
  if (key.startsWith("AIza")) return { name: "Google Gemini", baseURL: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-2.5-flash" };
  if (key.startsWith("gsk_")) return { name: "Groq", baseURL: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile" };
  if (key.startsWith("xai-")) return { name: "xAI", baseURL: "https://api.x.ai/v1", model: "grok-3-mini" };
  return { name: "OpenAI", baseURL: "https://api.openai.com/v1", model: "gpt-4o-mini" };
}

/** Real model ids carry a version digit or separator (gpt-4o-mini, gemini-2.5-flash); words like "NA" do not. */
export function looksLikeModel(m: string) {
  return /^[\w.\/:-]+$/.test(m) && /[\d\-\/.:]/.test(m);
}

export function requireAi(): AiConfig {
  const c = aiConfig();
  if (!c) throw new Error("Add your AI key in Settings (AI_API_KEY) to use AI.");
  return c;
}

export async function aiChat(body: Record<string, unknown>) {
  const c = requireAi();
  const res = await fetch(`${c.baseURL}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${c.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: c.model, ...body }),
  });
  if (res.status === 401 || res.status === 403) throw new Error("Your AI provider rejected the key. Check AI_API_KEY in Settings.");
  if (res.status === 429) throw new Error("Too many requests right now. Please try again in a moment.");
  if (res.status === 402) throw new Error("Your AI provider account is out of credit.");
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    console.error("AI call failed", res.status, t.slice(0, 300));
    throw new Error(`The AI could not reply (${res.status}).`);
  }
  return (await res.json()) as { choices: { message: { content: string } }[] };
}
