import { ChatOpenAI } from "@langchain/openai";
import { createAgent as createLangChainAgent } from "langchain";
import type { AgentChatMessage, StreamAgentAnswerInput } from "@/types/agent";
import { createWikiAgentTools } from "@/lib/agent/tools";

export type { AgentChatMessage, StreamAgentAnswerInput } from "@/types/agent";

const defaultApiBaseUrl = "https://api.openai.com/v1";
const defaultResponsesModel = "gpt-4.1-mini";

export type WikiAgentRuntime = {
  createAgent: (input: {
    locale: StreamAgentAnswerInput["locale"];
    context: StreamAgentAnswerInput["context"];
  }) => Promise<WikiAgentLike> | WikiAgentLike;
};

type WikiAgentLike = {
  stream: (
    state: { messages: AgentChatMessage[] },
    config: { streamMode: "messages"; signal?: AbortSignal },
  ) => Promise<AsyncIterable<unknown>>;
};

export function isAgentConfigured(env: NodeJS.ProcessEnv = process.env) {
  return Boolean(env.OPENAI_API_KEY);
}

export async function embedTexts(texts: string[], signal?: AbortSignal) {
  if (texts.length === 0) {
    return [];
  }

  const response = await fetch(buildOpenAiUrl("/embeddings"), {
    method: "POST",
    headers: getOpenAiHeaders(),
    body: JSON.stringify({
      model: process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small",
      input: texts,
    }),
    signal,
  });

  if (!response.ok) {
    throw new Error(`OpenAI embeddings request failed: ${await response.text()}`);
  }

  const payload = (await response.json()) as {
    data: Array<{ embedding: number[] }>;
  };

  return payload.data.map((entry) => entry.embedding);
}

export async function streamAgentAnswer(
  input: StreamAgentAnswerInput,
  runtime: WikiAgentRuntime = defaultWikiAgentRuntime,
) {
  const agent = await runtime.createAgent({
    locale: input.locale,
    context: input.context,
  });

  const stream = await agent.stream(
    {
      messages: input.messages,
    },
    {
      streamMode: "messages",
      signal: input.signal,
    },
  );

  for await (const chunk of stream) {
    const text = extractTextChunk(chunk);

    if (text) {
      input.onDelta(text);
    }
  }
}

export const defaultWikiAgentRuntime: WikiAgentRuntime = {
  createAgent({ locale, context }) {
    return createLangChainAgent({
      model: createWikiChatModel(),
      tools: createWikiAgentTools(),
      systemPrompt: buildSystemPrompt(locale, context),
    });
  },
};

function createWikiChatModel() {
  const baseURL = process.env.OPENAI_API_BASE_URL ?? defaultApiBaseUrl;

  return new ChatOpenAI({
    model: process.env.OPENAI_RESPONSES_MODEL ?? defaultResponsesModel,
    temperature: 0.2,
    streamUsage: false,
    useResponsesApi: true,
    configuration: {
      baseURL,
    },
  });
}

function buildSystemPrompt(
  locale: StreamAgentAnswerInput["locale"],
  context: StreamAgentAnswerInput["context"],
) {
  const contextText = context.length
    ? context
        .map(
          (entry, index) =>
            `[${index + 1}] ${entry.title} (${entry.path})${entry.heading ? ` / ${entry.heading}` : ""}\n${entry.content}`,
        )
        .join("\n\n")
    : "No direct wiki chunks were retrieved for this turn.";

  if (locale === "zh") {
    return [
      "你是 LuckyWiki 的问答助手。",
      "只能根据当前已发布的 Wiki 内容和你可调用的只读工具回答，不能编造，也不能使用站外常识补全。",
      "如果当前上下文不足，先使用工具继续查找相关文章；如果仍然不足，就明确说明 Wiki 中没有足够信息。",
      "回答使用简体中文，语气自然、简洁、直接。",
      "尽量在回答里提到相关文章的标题或路径，方便用户继续阅读原文。",
      "",
      "可用 Wiki 上下文：",
      contextText,
    ].join("\n");
  }

  return [
    "You are the LuckyWiki assistant.",
    "Answer only from currently published wiki content and the read-only tools available to you. Do not invent facts or fill gaps with outside knowledge.",
    "If the current context is insufficient, first use tools to look up relevant articles; if it is still insufficient, clearly say the wiki does not contain enough information.",
    "Reply in English with a concise, direct tone.",
    "Prefer mentioning article titles or paths so the user can continue reading the original source.",
    "",
    "Available wiki context:",
    contextText,
  ].join("\n");
}

function buildOpenAiUrl(pathname: string) {
  const baseUrl = process.env.OPENAI_API_BASE_URL ?? defaultApiBaseUrl;
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const normalizedPath = pathname.startsWith("/") ? pathname.slice(1) : pathname;
  return new URL(normalizedPath, normalizedBase).toString();
}

function getOpenAiHeaders() {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set.");
  }

  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
}

function extractTextChunk(chunk: unknown): string {
  if (!chunk) {
    return "";
  }

  if (Array.isArray(chunk)) {
    return chunk.map(extractTextChunk).join("");
  }

  if (typeof chunk === "string") {
    return chunk;
  }

  if (typeof chunk !== "object") {
    return "";
  }

  const value = chunk as {
    content?: unknown;
    text?: unknown;
  };

  if (typeof value.text === "string") {
    return value.text;
  }

  if (typeof value.content === "string") {
    return value.content;
  }

  if (Array.isArray(value.content)) {
    return value.content
      .map((block) => {
        if (!block || typeof block !== "object") {
          return "";
        }

        const blockValue = block as {
          type?: string;
          text?: unknown;
          content?: unknown;
        };

        if (typeof blockValue.text === "string") {
          return blockValue.text;
        }

        if (typeof blockValue.content === "string") {
          return blockValue.content;
        }

        return typeof blockValue.type === "string" ? "" : "";
      })
      .join("");
  }

  return "";
}
