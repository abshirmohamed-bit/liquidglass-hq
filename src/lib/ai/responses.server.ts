import { createOpenAI } from "@ai-sdk/openai";
import { streamText, stepCountIs, type ModelMessage, type ToolSet } from "ai";

import {
  createLovableAiGatewayRunIdFetch,
  getLovableAiGatewayRunId,
  withLovableAiGatewayRunIdHeader,
} from "./run-id.ts";

export function createResponsesCall(
  request: Request,
  config: { baseURL: string; apiKey: string; model: string; tools?: ToolSet; chat?: boolean },
  messages: ModelMessage[],
  instructions?: string,
) {
  const runIdFetch = createLovableAiGatewayRunIdFetch(getLovableAiGatewayRunId(request));
  let failure: { status: number; message: string } | undefined;
  const provider = createOpenAI({
    baseURL: `${config.baseURL.replace(/\/+$/, "").replace(/\/v1$/, "")}/v1`,
    apiKey: config.apiKey,
    headers: { "Lovable-API-Key": config.apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: async (input, init) => {
      const response = await runIdFetch.fetch(input, init);
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
  const reasoning = config.model !== "openai/chat-latest";
  const result = streamText({
    model: provider.responses(config.model),
    // AI SDK 6 lacks `instructions`: rename this key to `system` there.
    ...(instructions ? { instructions } : {}),
    messages,
    abortSignal: request.signal,
    ...(config.chat ? { maxRetries: 0 } : {}),
    ...(config.tools ? { tools: config.tools, stopWhen: stepCountIs(50) } : {}),
    providerOptions: {
      openai: {
        store: false,
        ...(reasoning
          ? {
              forceReasoning: true,
              reasoningEffort: "medium",
              reasoningSummary: "auto",
              include: ["reasoning.encrypted_content"],
            }
          : {}),
      },
    },
  });
  return {
    result,
    response: () =>
      withLovableAiGatewayRunIdHeader(
        result.toUIMessageStreamResponse({ sendReasoning: true }),
        runIdFetch,
      ),
    chatResponse: async (
      options: Parameters<typeof result.toUIMessageStreamResponse>[0],
      onDenied: (reason: string) => Promise<void>,
    ) => {
      const response = await withLovableAiGatewayRunIdHeader(
        result.toUIMessageStreamResponse({ ...options, sendReasoning: true }),
        runIdFetch,
      );
      if (failure) {
        if (failure.status === 403) await onDenied(failure.message);
        await response.body?.cancel();
        return Response.json({ message: failure.message }, { status: failure.status });
      }
      return response;
    },
  };
}
