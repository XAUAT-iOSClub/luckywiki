import { NextResponse } from "next/server";
import { z } from "zod";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/get-dictionary";
import type { AgentChatMessage, AgentSource, AgentToolCallEvent, RetrievedAgentChunk } from "@/types/agent";

const agentRequestSchema = z.object({
  locale: z.enum(["zh", "en"]),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(4000),
      }),
    )
    .min(1)
    .max(12),
});

export async function createAgentRouteResponse(
  request: Request,
  deps: {
    getDictionary: (locale: Locale) => Promise<Dictionary>;
    retrieveRelevantChunks: (query: string) => Promise<RetrievedAgentChunk[]>;
    findSuggestedSources: (query: string) => Promise<AgentSource[]>;
    streamAnswer: (input: {
      locale: Locale;
      context: RetrievedAgentChunk[];
      messages: AgentChatMessage[];
      onDelta: (delta: string) => void;
      onToolCall?: (event: AgentToolCallEvent) => void;
      signal?: AbortSignal;
    }) => Promise<void>;
  },
) {
  const rawPayload = sanitizeAgentRequestPayload(await request.json());
  const payload = agentRequestSchema.safeParse(rawPayload);

  if (!payload.success) {
    return NextResponse.json(
      {
        error: "Invalid request payload.",
      },
      { status: 400 },
    );
  }

  const { locale, messages } = payload.data;
  const dictionary = await deps.getDictionary(locale);
  const latestMessage = messages.at(-1);

  if (!latestMessage || latestMessage.role !== "user") {
    return NextResponse.json(
      {
        error: "The latest message must be a user message.",
      },
      { status: 400 },
    );
  }

  let chunks: RetrievedAgentChunk[] = [];

  try {
    chunks = await deps.retrieveRelevantChunks(latestMessage.content);
  } catch (error) {
    // Embedding providers are optional for the chat path. Let the agent use
    // its article/path tools when semantic retrieval is unavailable.
    console.error("[agent] semantic retrieval failed", error);
  }

  const sources =
    chunks.length > 0
      ? dedupeSources(chunks)
      : await deps.findSuggestedSources(latestMessage.content);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const sendEvent = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      sendEvent("sources", {
        sources,
      });

      try {
        await deps.streamAnswer({
          locale,
          context: chunks,
          messages,
          onDelta(delta) {
            sendEvent("delta", { text: delta });
          },
          onToolCall(event) {
            sendEvent("tool", event);
          },
          signal: request.signal,
        });

        sendEvent("done", {});
        controller.close();
      } catch (error) {
        console.error("[agent] response stream failed", error);
        sendEvent("error", {
          message: dictionary.agent.errors.generic,
        });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-store",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
    },
  });
}

function sanitizeAgentRequestPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return payload;
  }

  const rawMessages = Array.isArray((payload as { messages?: unknown[] }).messages)
    ? (payload as { messages: unknown[] }).messages
    : [];

  return {
    ...(payload as Record<string, unknown>),
    messages: rawMessages.filter((message) => {
      if (!message || typeof message !== "object") {
        return false;
      }

      const content = "content" in message ? message.content : "";
      return typeof content === "string" && content.trim().length > 0;
    }),
  };
}

function dedupeSources(chunks: Pick<RetrievedAgentChunk, "path" | "title">[]) {
  return Array.from(
    new Map(chunks.map((chunk) => [chunk.path, { path: chunk.path, title: chunk.title }])).values(),
  );
}
