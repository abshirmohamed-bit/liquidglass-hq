import { HIGGSFIELD_MODEL, higgsfieldBody } from "./thumbnail-rules";

export function higgsfieldCredentials() {
  const key = process.env["HIGGSFIELD_API_KEY"];
  const secret = process.env["HIGGSFIELD_SECRET"];
  return key && secret ? `${key}:${secret}` : null;
}

import { knowledgeBlock } from "./training-rules";
export async function planThumbnail(input: { history: string[]; knowledge: (string | null)[]; clientKnowledge: (string | null)[]; client: string | null; request: string }) {
  const system = `${knowledgeBlock("Global thumbnail knowledge (THUMBNAIL_GLOBAL)", input.knowledge)}
${input.client ? knowledgeBlock(`Knowledge specific to ${input.client}`, input.clientKnowledge) : ""}

You are an expert YouTube thumbnail art director for personal-brand creators. First explain your creative direction in 1-3 short sentences, based on the training above and why it should work. Then produce an optimized nano-banana-pro image prompt targeting 16:9, 4K, bold and readable at small sizes, high contrast, and emotionally compelling. Use the full session history: follow-up requests like "make the background darker" modify the previous design. Learn from ratings: repeat what scored high, avoid what scored low.`;
  const { aiChat } = await import("./ai/provider.server");
  const json = await aiChat({
      messages: [
        { role: "system", content: system },
        { role: "user", content: `Session so far:\n${input.history.join("\n") || "(new session)"}\n\nNew request: ${input.request}` },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "thumbnail_plan",
          strict: true,
          schema: { type: "object", additionalProperties: false, required: ["direction", "image_prompt"], properties: { direction: { type: "string" }, image_prompt: { type: "string" } } },
        },
      },
  });
  return JSON.parse(json.choices[0]?.message.content ?? "{}") as { direction: string; image_prompt: string };
}

export async function generateImages(prompt: string, count: number, credentials: string) {
  const headers = { Authorization: `Key ${credentials}`, "Content-Type": "application/json", Accept: "application/json" };
  const start = await fetch(`https://platform.higgsfield.ai/${HIGGSFIELD_MODEL}`, { method: "POST", headers, body: JSON.stringify(higgsfieldBody(prompt, count)) });
  if (start.status === 401 || start.status === 403) throw new Error("Higgsfield rejected the saved key. Check your Higgsfield key and secret.");
  if (!start.ok) throw new Error("Higgsfield could not start the image.");
  const { request_id } = (await start.json()) as { request_id: string };
  for (let i = 0; i < 55; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const s = await fetch(`https://platform.higgsfield.ai/requests/${request_id}/status`, { headers });
    if (!s.ok) continue;
    const body = (await s.json()) as { status: string; images?: { url: string }[] };
    if (body.status === "completed") return (body.images ?? []).map((x) => x.url);
    if (body.status === "nsfw") throw new Error("Higgsfield blocked this image for safety. Try a different description.");
    if (body.status === "failed" || body.status === "canceled") throw new Error("Higgsfield could not create the image.");
  }
  throw new Error("The image is taking too long. Please try again.");
}
