import { ChatOpenAI } from "@langchain/openai";
import { createAgent as createLangChainAgent } from "langchain";
import type { AgentChatMessage, AgentToolCallEvent, StreamAgentAnswerInput } from "@/types/agent";
import {
  getEmbeddingDimensions,
  getEmbeddingRequestDimensions,
} from "@/lib/agent/embedding-dimensions";
import { createWikiAgentTools } from "@/lib/agent/tools";
import { createWikiQaGraph, type WikiQaGraphInput } from "@/lib/agent/graph";
import { retrieveRelevantAgentChunks } from "@/lib/agent/search";
import {
  buildOpenAiUrl,
  defaultApiBaseUrl,
  getOpenAiHeaders,
  isOpenAiConfigured,
  normalizeOpenAiBaseUrl,
} from "@/lib/openai/base-url";

export type { AgentChatMessage, AgentToolCallEvent, StreamAgentAnswerInput } from "@/types/agent";
export { normalizeOpenAiBaseUrl };

const defaultResponsesModel = "gpt-4.1-mini";
const defaultModelTimeoutMs = 45_000;

export type WikiAgentRuntime = {
  createAgent: (input: {
    locale: StreamAgentAnswerInput["locale"];
    context: StreamAgentAnswerInput["context"];
  }) => Promise<WikiAgentLike> | WikiAgentLike;
  createDirectAnswer?: (input: {
    locale: StreamAgentAnswerInput["locale"];
    context: StreamAgentAnswerInput["context"];
  }) => Promise<WikiAgentLike> | WikiAgentLike;
  createGraph?: (input: {
    locale: StreamAgentAnswerInput["locale"];
    context: StreamAgentAnswerInput["context"];
    onDelta: (delta: string) => void;
    onToolCall?: (event: AgentToolCallEvent) => void;
  }) => {
    invoke: (input: WikiQaGraphInput) => Promise<unknown>;
  };
};

type WikiAgentLike = {
  stream: (
    state: { messages: AgentChatMessage[] },
    config: { streamMode: "messages"; signal?: AbortSignal },
  ) => Promise<AsyncIterable<unknown>>;
};

export function isAgentConfigured(env: NodeJS.ProcessEnv = process.env) {
  return isOpenAiConfigured(env);
}

export async function embedTexts(texts: string[], signal?: AbortSignal) {
  if (texts.length === 0) {
    return [];
  }

  const timeout = AbortSignal.timeout(getEmbeddingTimeoutMs());
  const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let response: Response;

  try {
    response = await fetch(buildOpenAiUrl("/embeddings"), {
      method: "POST",
      headers: getOpenAiHeaders(),
      body: JSON.stringify(buildEmbeddingRequest(texts)),
      signal: requestSignal,
    });
  } catch (error) {
    if (timeout.aborted && !signal?.aborted) {
      throw new Error(
        `OpenAI embeddings request timed out after ${getEmbeddingTimeoutMs()}ms.`,
        { cause: error },
      );
    }
    throw error;
  }

  if (!response.ok) {
    throw new Error(`OpenAI embeddings request failed: ${await response.text()}`);
  }

  const payload = (await response.json()) as {
    data: Array<{ embedding: number[] }>;
  };

  return payload.data.map((entry) => entry.embedding);
}

export function buildEmbeddingRequest(
  texts: string[],
  env: Partial<NodeJS.ProcessEnv> = process.env,
) {
  const dimensions = getEmbeddingRequestDimensions(env);
  const expectedDimensions = getEmbeddingDimensions(env);

  if (dimensions !== undefined && dimensions !== expectedDimensions) {
    throw new Error(
      "OPENAI_EMBEDDING_DIMENSIONS must match AGENT_EMBEDDING_DIMENSIONS.",
    );
  }

  return {
    model: env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small",
    input: texts,
    ...(dimensions === undefined ? {} : { dimensions }),
  };
}

function getEmbeddingTimeoutMs(env: NodeJS.ProcessEnv = process.env) {
  const parsed = Number(env.OPENAI_EMBEDDING_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 60_000;
}

function withModelTimeout(signal?: AbortSignal) {
  const timeout = AbortSignal.timeout(getModelTimeoutMs());
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

function getModelTimeoutMs(env: NodeJS.ProcessEnv = process.env) {
  const parsed = Number(env.AGENT_MODEL_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : defaultModelTimeoutMs;
}

const TOOL_LABELS: Record<string, string> = {
  search_wiki_knowledge: "搜索 Wiki 知识库",
  get_wiki_article_details: "获取文章详情",
  search_wiki_paths: "搜索 Wiki 路径",
  list_recent_wiki_articles: "列出最近更新",
  get_related_wiki_articles: "查找相关文章",
  list_wiki_categories: "浏览 Wiki 分类",
};

function buildToolCallSummary(name: string, content: string): string {
  try {
    const data = JSON.parse(content) as Record<string, unknown>;

    switch (name) {
      case "search_wiki_knowledge": {
        const chunks = Array.isArray(data.chunks) ? data.chunks : [];
        const sources = Array.isArray(data.sources) ? data.sources : [];
        const count = chunks.length || sources.length;

        return count > 0 ? `找到 ${count} 篇相关文章` : "未找到相关文章";
      }
      case "get_wiki_article_details":
        if (data.found && data.article && typeof data.article === "object") {
          const article = data.article as { title?: string };

          return `获取文章: ${article.title ?? String(data.path ?? "")}`;
        }

        return `未找到文章: ${String(data.path ?? "")}`;
      case "search_wiki_paths": {
        const matches = Array.isArray(data.matches) ? data.matches : [];

        return `找到 ${matches.length} 个匹配路径`;
      }
      case "list_recent_wiki_articles": {
        const articles = Array.isArray(data.articles) ? data.articles : [];

        return `列出 ${articles.length} 篇最近文章`;
      }
      case "get_related_wiki_articles": {
        const articles = Array.isArray(data.articles) ? data.articles : [];

        return `找到 ${articles.length} 篇相关文章`;
      }
      case "list_wiki_categories": {
        const categories = Array.isArray(data.categories) ? data.categories : [];

        return `列出 ${categories.length} 个分类`;
      }
      default:
        return "";
    }
  } catch {
    return "";
  }
}

function extractToolCallInfo(chunk: unknown): AgentToolCallEvent | null {
  if (Array.isArray(chunk)) {
    for (const item of chunk) {
      const info = extractToolCallInfo(item);

      if (info) {
        return info;
      }
    }

    return null;
  }

  if (!chunk || typeof chunk !== "object") {
    return null;
  }

  const obj = chunk as Record<string, unknown>;

  if (typeof obj.tool_call_id === "string" && typeof obj.name === "string") {
    const label = TOOL_LABELS[obj.name] ?? obj.name;
    const content = typeof obj.content === "string" ? obj.content : "";
    const summary = buildToolCallSummary(obj.name, content);

    return { name: obj.name, label, summary };
  }

  return null;
}

export async function streamAgentAnswer(
  input: StreamAgentAnswerInput,
  runtime: WikiAgentRuntime = defaultWikiAgentRuntime,
) {
  const signal = withModelTimeout(input.signal);

  if (runtime.createGraph) {
    const graph = runtime.createGraph({
      locale: input.locale,
      context: input.context,
      onDelta: input.onDelta,
      onToolCall: input.onToolCall,
    });

    await graph.invoke({
      locale: input.locale,
      context: input.context,
      messages: input.messages,
      signal,
    });
    return;
  }

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
      signal,
    },
  );

  for await (const chunk of stream) {
    const toolInfo = extractToolCallInfo(chunk);

    if (toolInfo) {
      input.onToolCall?.(toolInfo);
      continue;
    }

    const text = extractTextChunk(chunk);

    if (text) {
      input.onDelta(text);
    }
  }
}

export const defaultWikiAgentRuntime: WikiAgentRuntime = {
  createAgent({ locale, context }) {
    return createLangChainAgent({
      model: getWikiChatModel(),
      tools: createWikiAgentTools(),
      systemPrompt: buildSystemPrompt(locale, context),
    });
  },
  createDirectAnswer({ locale, context }) {
    const model = getWikiChatModel();

    return {
      async stream(state, config) {
        return model.stream(
          [
            {
              role: "system",
              content: buildDirectSystemPrompt(locale, context),
            },
            ...state.messages,
          ],
          { signal: config.signal },
        );
      },
    };
  },
  createGraph({ onDelta, onToolCall }) {
    return createWikiQaGraph({
      createAgent: ({ locale: agentLocale, context: agentContext }) =>
        defaultWikiAgentRuntime.createAgent({
          locale: agentLocale,
          context: agentContext,
        }),
      createDirectAnswer: ({ locale: agentLocale, context: agentContext }) =>
        defaultWikiAgentRuntime.createDirectAnswer!({
          locale: agentLocale,
          context: agentContext,
        }),
      retrieveRelevantChunks: retrieveRelevantAgentChunks,
      onDelta,
      onToolCall,
    });
  },
};

let wikiChatModel: ChatOpenAI | undefined;

function getWikiChatModel() {
  if (!wikiChatModel) {
    wikiChatModel = createWikiChatModel();
  }

  return wikiChatModel;
}

function createWikiChatModel() {
  const baseURL = normalizeOpenAiBaseUrl(process.env.OPENAI_API_BASE_URL ?? defaultApiBaseUrl);

  return new ChatOpenAI({
    model: process.env.OPENAI_RESPONSES_MODEL ?? defaultResponsesModel,
    temperature: 0.2,
    streamUsage: false,
    // Work around a late-stream parsing bug in @langchain/openai 1.4.5 that
    // can throw after the full answer has already been emitted.
    useResponsesApi: false,
    configuration: {
      baseURL,
    },
  });
}

function formatWikiContext(context: StreamAgentAnswerInput["context"]) {
  return context.length
    ? context
        .map(
          (entry, index) =>
            `[${index + 1}] ${entry.title} (${entry.path})${entry.heading ? ` / ${entry.heading}` : ""}\n${entry.content}`,
        )
        .join("\n\n")
    : "No direct wiki chunks were retrieved for this turn.";
}

function buildSystemPrompt(
  locale: StreamAgentAnswerInput["locale"],
  context: StreamAgentAnswerInput["context"],
) {
  const contextText = formatWikiContext(context);

  if (locale === "zh") {
    return [
      "你是 LuckyWiki 的问答助手。",
      "只能根据当前已发布的 Wiki 内容和你可调用的只读工具回答，不能编造，也不能使用站外常识补全。",
      "下面已经附上了本轮检索到的 Wiki 内容。如果这些内容足以回答，就直接回答，不要重复搜索；只有明显缺少关键信息时才调用工具。",
      "如果使用工具，避免重复调用同一个工具或反复搜索相同的关键词；拿到足够信息后立即回答。",
      "如果仍然不足，就明确说明 Wiki 中没有足够信息。",
      "回答使用简体中文，语气自然、简洁、直接。",
      "尽量在回答里提到相关文章的标题或路径，方便用户继续阅读原文。",
      "重要：不要输出你的思考过程或工具调用的说明，直接给出最终答案。用户不需要知道你做了什么搜索，只需要答案本身。",
      "",
      "可用 Wiki 上下文：",
      contextText,
    ].join("\n");
  }

  return [
    "You are the LuckyWiki assistant.",
    "Answer only from currently published wiki content and the read-only tools available to you. Do not invent facts or fill gaps with outside knowledge.",
    "The wiki context retrieved for this turn is already included below. If it is enough to answer, answer directly and do not repeat the search; only use tools when key information is clearly missing.",
    "When you do use tools, avoid calling the same tool repeatedly or searching the same keywords again; answer as soon as you have enough information.",
    "If it is still insufficient, clearly say the wiki does not contain enough information.",
    "Reply in English with a concise, direct tone.",
    "Prefer mentioning article titles or paths so the user can continue reading the original source.",
    "IMPORTANT: Do NOT output your thinking process or narrate your tool usage. Give the final answer directly. Users do not need to know what searches you performed.",
    "",
    "Available wiki context:",
    contextText,
  ].join("\n");
}

function buildDirectSystemPrompt(
  locale: StreamAgentAnswerInput["locale"],
  context: StreamAgentAnswerInput["context"],
) {
  const contextText = formatWikiContext(context);

  if (locale === "zh") {
    return [
      "你是 LuckyWiki 的问答助手。",
      "下面已经检索到了与这个问题相关的 Wiki 内容，请直接根据这些内容回答，不需要调用工具。",
      "只能根据这些内容回答，不能编造，也不能使用站外常识补全。",
      "如果这些内容不足以回答，就明确说明 Wiki 中没有足够信息，不要猜测。",
      "回答使用简体中文，语气自然、简洁、直接。",
      "尽量提到相关文章的标题或路径，方便用户继续阅读原文。",
      "不要输出思考过程或检索过程，直接给出最终答案。",
      "",
      "Wiki 上下文：",
      contextText,
    ].join("\n");
  }

  return [
    "You are the LuckyWiki assistant.",
    "The wiki content relevant to this question has already been retrieved and is included below. Answer directly from it; you do not need to call tools.",
    "Answer only from this content. Do not invent facts or fill gaps with outside knowledge.",
    "If the content is insufficient, clearly say the wiki does not contain enough information instead of guessing.",
    "Reply in English with a concise, direct tone.",
    "Prefer mentioning article titles or paths so the user can continue reading the original source.",
    "Do NOT output your thinking or retrieval process. Give the final answer directly.",
    "",
    "Wiki context:",
    contextText,
  ].join("\n");
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

  const value = chunk as Record<string, unknown>;

  if (typeof value.tool_call_id === "string") {
    return "";
  }

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
