import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { streamText, stepCountIs, type ModelMessage, type ToolSet } from "ai";

/** Streams a chat from the user's own OpenAI-compatible AI provider. */
export function createResponsesCall(
  request: Request,
  config: { baseURL: string; apiKey: string; model: string; tools?: ToolSet; chat?: boolean },
  messages: ModelMessage[],
  instructions?: string,
) {
  let failure: { status: number; message: string } | undefined;
  const provider = createOpenAICompatible({
    name: "crayzmundo-ai",
    baseURL: config.baseURL.replace(/\/+$/, ""),
    apiKey: config.apiKey,
    fetch: async (input, init) => {
      const response = await fetch(input, init);
      if (config.chat && !response.ok) {
        const body = await response.clone().text();
        let message = body;
        try {
          const parsed = JSON.parse(body);
          message = parsed.message || parsed.error?.message || body;
        } catch {
          /* Preserve upstream error text. */
        }
        failure = { status: response.status, message };
      }
      return response;
    },
  });
  const result = streamText({
    model: provider.chatModel(config.model),
    ...(instructions ? { system: instructions } : {}),
    messages,
    abortSignal: request.signal,
    ...(config.chat ? { maxRetries: 0 } : {}),
    ...(config.tools ? { tools: config.tools, stopWhen: stepCountIs(50) } : {}),
  });
  return {
    result,
    response: () => result.toUIMessageStreamResponse({ sendReasoning: true }),
    chatResponse: async (
      options: Parameters<typeof result.toUIMessageStreamResponse>[0],
      onDenied: (reason: string) => Promise<void>,
    ) => {
      const response = result.toUIMessageStreamResponse({ ...options, sendReasoning: true });
      if (failure) {
        if (failure.status === 403) await onDenied(failure.message);
        await response.body?.cancel();
        return Response.json({ message: failure.message }, { status: failure.status });
      }
      return response;
    },
  };
}
