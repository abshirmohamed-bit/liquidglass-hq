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
  const baseURL = (process.env["AI_BASE_URL"] || "https://api.openai.com/v1").replace(/\/+$/, "");
  return {
    apiKey,
    baseURL,
    model: process.env["AI_MODEL"] || "gpt-4o-mini",
    transcribeModel: process.env["AI_TRANSCRIBE_MODEL"] || "whisper-1",
  };
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
