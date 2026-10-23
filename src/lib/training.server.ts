import { aiChat } from "./ai/provider.server";

export async function gatewayText(system: string, user: string) {
  const json = await aiChat({ messages: [{ role: "system", content: system }, { role: "user", content: user }] });
  return json.choices[0]?.message.content?.trim() ?? "";
}
