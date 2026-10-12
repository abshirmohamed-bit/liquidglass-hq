export async function gatewayText(system: string, user: string) {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("AI is not available right now.");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "google/gemini-3-flash-preview", messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
  });
  if (res.status === 429) throw new Error("Too many requests right now. Please try again in a moment.");
  if (res.status === 402) throw new Error("AI credits have run out. Add credits in your workspace to continue.");
  if (!res.ok) throw new Error("The AI could not reply. Please try again.");
  const json = (await res.json()) as { choices: { message: { content: string } }[] };
  return json.choices[0]?.message.content?.trim() ?? "";
}
