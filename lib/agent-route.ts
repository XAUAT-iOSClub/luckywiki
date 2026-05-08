import { NextResponse } from "next/server";
import { z } from "zod";
import type { Locale } from "@/lib/i18n/config";
import type { Dictionary } from "@/lib/i18n/get-dictionary";
import type { AgentChatMessage } from "@/lib/agent-openai";
import type { AgentSource, RetrievedAgentChunk } from "@/lib/agent-search";

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

  const chunks = await deps.retrieveRelevantChunks(latestMessage.content);
  const sources = dedupeSources(chunks);

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

      if (chunks.length === 0) {
        const suggestions = await deps.findSuggestedSources(latestMessage.content);
        const message =
          suggestions.length > 0
            ? formatNoMatchMessage(locale, dictionary, true)
            : formatNoMatchMessage(locale, dictionary, false);

        sendEvent("sources", { sources: suggestions });
        sendEvent("message", { text: message });
        sendEvent("done", {});
        controller.close();
        return;
      }

      try {
        await deps.streamAnswer({
          locale,
          context: chunks,
          messages,
          onDelta(delta) {
            sendEvent("delta", { text: delta });
          },
          signal: request.signal,
        });

        sendEvent("done", {});
        controller.close();
      } catch (error) {
        sendEvent("error", {
          message:
            error instanceof Error
              ? error.message
              : dictionary.agent.errors.generic,
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

function formatNoMatchMessage(
  locale: Locale,
  dictionary: Dictionary,
  hasSuggestions: boolean,
) {
  if (locale === "zh") {
    return hasSuggestions
      ? dictionary.agent.noMatchWithSuggestions
      : dictionary.agent.noMatch;
  }

  return hasSuggestions
    ? dictionary.agent.noMatchWithSuggestions
    : dictionary.agent.noMatch;
}
