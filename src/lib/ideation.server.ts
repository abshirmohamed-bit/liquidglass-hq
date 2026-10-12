import { z } from "zod";
import { convertToModelMessages, validateUIMessages, tool, generateId, type UIMessage } from "ai";
import { authenticateRequest } from "./request-auth.server";
import { createResponsesCall } from "./ai/responses.server";
import type { Json } from "@/integrations/supabase/types";
import { fetchIdeationChannel } from "./ideation-channel.server";

export async function handleIdeation(request: Request) {
  let auth: Awaited<ReturnType<typeof authenticateRequest>>;
  try {
    auth = await authenticateRequest(request);
  } catch (error) {
    return Response.json(
      { message: error instanceof Error ? error.message : "Sign in required." },
      { status: 401 },
    );
  }
  const input = z
    .object({ threadId: z.string().uuid(), messages: z.array(z.unknown()).min(1) })
    .safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ message: "Invalid conversation." }, { status: 400 });
  const { supabase } = auth;
  const thread = await supabase
    .from("ideation_threads")
    .select("*")
    .eq("id", input.data.threadId)
    .single();
  if (thread.error || !thread.data)
    return Response.json({ message: "Conversation not found." }, { status: 404 });
  if (thread.data.ai_block_reason)
    return Response.json({ message: thread.data.ai_block_reason }, { status: 403 });
  let messages: UIMessage[];
  try {
    messages = await validateUIMessages({ messages: input.data.messages });
  } catch {
    return Response.json({ message: "Invalid conversation messages." }, { status: 400 });
  }
  const last = messages.at(-1);
  if (
    !last ||
    last.role !== "user" ||
    !last.parts.some((part) => part.type === "text" && part.text.trim())
  )
    return Response.json({ message: "Write a message first." }, { status: 400 });
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) return Response.json({ message: "AI is not configured yet." }, { status: 401 });
  const save = async (message: UIMessage) => {
    const content = message.parts
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("\n");
    const { error } = await supabase
      .from("ideation_messages")
      .upsert(
        {
          thread_id: thread.data.id,
          sdk_message_id: message.id,
          role: message.role,
          content,
          parts: message.parts as unknown as Json,
        },
        { onConflict: "thread_id,sdk_message_id" },
      );
    if (error) throw new Error(`Could not save conversation: ${error.message}`);
  };
  await save(last);
  const saved = await supabase
    .from("ideation_messages")
    .select("*")
    .eq("thread_id", thread.data.id)
    .order("timestamp");
  if (saved.error) return Response.json({ message: saved.error.message }, { status: 500 });
  messages = saved.data.map((row) => ({
    id: row.sdk_message_id || row.id,
    role: row.role === "user" ? "user" : "assistant",
    parts: Array.isArray(row.parts)
      ? (row.parts as UIMessage["parts"])
      : [{ type: "text", text: row.content || "" }],
  }));
  const knowledge = await supabase
    .from("knowledge_entries")
    .select("learned_principle")
    .eq("scope", "VIDEO_GLOBAL");
  if (knowledge.error) return Response.json({ message: knowledge.error.message }, { status: 500 });
  const client = thread.data.client_id
    ? await supabase
        .from("clients")
        .select("name,channel_summary,offers,content_strategy")
        .eq("id", thread.data.client_id)
        .single()
    : null;
  if (client?.error) return Response.json({ message: client.error.message }, { status: 404 });
  const system = `You are an expert content strategist specializing in personal-brand growth on YouTube and social media. You help ideate video titles, thumbnail concepts, content angles, hooks, and growth strategies. You remember everything in this thread and build on previous insights. When given a YouTube URL, analyze its content strategy and extract learnings. Use your channel tool for current uploads and your client tool for actual agency records. Never invent channel uploads, stats or offers. Only use long-form videos lasting at least 240 seconds (four minutes), regardless of YouTube tab. If a lookup is unavailable, explain this instead of claiming to inspect the channel. Client context: ${JSON.stringify(client?.data || {})}. Global video principles: ${knowledge.data.map((row) => row.learned_principle).join("\n")}`;
  const tools = {
    clients: tool({
      description: "Read actual agency clients visible to this signed-in user.",
      inputSchema: z.object({}).strict(),
      strict: true,
      execute: async () => {
        const result = await supabase
          .from("clients")
          .select("name,channel_url,channel_summary,offers,content_strategy,plan_type,status");
        if (result.error) throw new Error(result.error.message);
        return result.data;
      },
    }),
    channel: tool({
      description:
        "Fetch current YouTube channel uploads, retaining only videos at least four minutes long.",
      inputSchema: z.object({ url: z.string() }).strict(),
      strict: true,
      execute: async ({ url }) => fetchIdeationChannel(url),
    }),
  };
  const call = createResponsesCall(
    request,
    {
      baseURL: "https://ai.gateway.lovable.dev/v1",
      apiKey: key,
      model: "openai/gpt-6-astra",
      chat: true,
      tools,
    },
    await convertToModelMessages(messages),
    system,
  );
  return call.chatResponse(
    {
      originalMessages: messages,
      generateMessageId: generateId,
      onFinish: async ({ responseMessage, isAborted }) => {
        if (!isAborted) await save(responseMessage);
      },
      onError: (error) =>
        error instanceof Error ? error.message : "The response could not finish.",
    },
    async (reason) => {
      const result = await supabase
        .from("ideation_threads")
        .update({ ai_block_reason: reason })
        .eq("id", thread.data.id);
      if (result.error)
        console.error("Could not persist AI access restriction:", result.error.message);
    },
  );
}
