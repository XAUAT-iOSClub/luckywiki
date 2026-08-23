import { ChatOpenAI } from "@langchain/openai";
import { createAgent as createLangChainAgent } from "langchain";
import type { AgentChatMessage, AgentToolCallEvent, StreamAgentAnswerInput } from "@/types/agent";
import { createWikiAgentTools } from "@/lib/agent/tools";

export type { AgentChatMessage, AgentToolCallEvent, StreamAgentAnswerInput } from "@/types/agent";

const defaultApiBaseUrl = "https://api.openai.com/v1";
const defaultResponsesModel = "gpt-4.1-mini";

/**
 * OpenAI-compatible gateways are commonly configured with either their root
 * URL or the complete `/v1` API URL. Keep both forms working for the SDK and
 * the direct embeddings request.
 */
export function normalizeOpenAiBaseUrl(value: string) {
  const trimmed = value.trim().replace(/\/+$/, "");

  if (!trimmed) {
    return defaultApiBaseUrl;
  }

  const url = new URL(trimmed);

  if (url.pathname === "") {
    url.pathname = "/v1";
  } else if (url.pathname === "/") {
    url.pathname = "/v1";
  }

  return url.toString().replace(/\/$/, "");
}

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
      model: createWikiChatModel(),
      tools: createWikiAgentTools(),
      systemPrompt: buildSystemPrompt(locale, context),
    });
  },
};

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
  const baseUrl = normalizeOpenAiBaseUrl(process.env.OPENAI_API_BASE_URL ?? defaultApiBaseUrl);
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
