import {
  Annotation,
  END,
  START,
  StateGraph,
} from "@langchain/langgraph";
import type {
  AgentChatMessage,
  AgentToolCallEvent,
  RetrievedAgentChunk,
  StreamAgentAnswerInput,
} from "@/types/agent";

type AgentContext = StreamAgentAnswerInput["context"];

const TOOL_LABELS: Record<string, string> = {
  search_wiki_knowledge: "搜索 Wiki 知识库",
  get_wiki_article_details: "获取文章详情",
  search_wiki_paths: "搜索 Wiki 路径",
  list_recent_wiki_articles: "列出最近更新",
  get_related_wiki_articles: "查找相关文章",
  list_wiki_categories: "浏览 Wiki 分类",
};

export type WikiQaGraphAgent = {
  stream: (
    state: { messages: AgentChatMessage[] },
    config: { streamMode: "messages"; signal?: AbortSignal },
  ) => Promise<AsyncIterable<unknown>>;
};

export type WikiQaGraphDeps = {
  createAgent: (input: {
    locale: StreamAgentAnswerInput["locale"];
    context: AgentContext;
  }) => Promise<WikiQaGraphAgent> | WikiQaGraphAgent;
  retrieveRelevantChunks?: (query: string) => Promise<RetrievedAgentChunk[]>;
  onDelta: (delta: string) => void;
  onToolCall?: (event: AgentToolCallEvent) => void;
};

const QaState = Annotation.Root({
  locale: Annotation<StreamAgentAnswerInput["locale"]>(),
  messages: Annotation<AgentChatMessage[]>({
    reducer: (_left, right) => right,
    default: () => [],
  }),
  context: Annotation<AgentContext>({
    reducer: (_left, right) => right,
    default: () => [],
  }),
  query: Annotation<string>({
    reducer: (_left, right) => right,
    default: () => "",
  }),
  answer: Annotation<string>({
    reducer: (_left, right) => right,
    default: () => "",
  }),
  toolCalls: Annotation<AgentToolCallEvent[]>({
    reducer: (_left, right) => right,
    default: () => [],
  }),
  attempt: Annotation<number>({
    reducer: (_left, right) => right,
    default: () => 0,
  }),
  signal: Annotation<AbortSignal | undefined>({
    reducer: (_left, right) => right,
    default: () => undefined,
  }),
});

export type WikiQaGraphInput = {
  locale: StreamAgentAnswerInput["locale"];
  messages: AgentChatMessage[];
  context: AgentContext;
  signal?: AbortSignal;
};

function latestUserQuery(messages: AgentChatMessage[]) {
  return messages
    .filter((message) => message.role === "user")
    .at(-1)?.content.trim() ?? "";
}

function buildRecoveryQuery(state: typeof QaState.State) {
  const previousUserMessages = state.messages
    .filter((message) => message.role === "user")
    .slice(-3)
    .map((message) => message.content.trim())
    .filter(Boolean);

  return previousUserMessages.join("\n") || state.query;
}

function routeAfterAnswer(state: typeof QaState.State) {
  return state.answer.trim().length === 0 && state.attempt === 0
    ? "recoverNode"
    : "finishNode";
}

/**
 * Build the explicit QA workflow used by the wiki Agent.
 *
 * The model remains a ReAct tool agent, while LangGraph owns the surrounding
 * control flow: recover missing retrieval context once, then finish with a
 * deterministic localized fallback if the model produced no text.
 */
export function createWikiQaGraph(deps: WikiQaGraphDeps) {
  const graph = new StateGraph(QaState)
    .addNode("prepareNode", (state) => ({
      query: latestUserQuery(state.messages),
    }))
    .addNode("answerNode", async (state) => {
      const agent = await deps.createAgent({
        locale: state.locale,
        context: state.context,
      });
      const stream = await agent.stream(
        { messages: state.messages },
        { streamMode: "messages", signal: state.signal },
      );

      let answer = "";
      const toolCalls: AgentToolCallEvent[] = [];

      for await (const chunk of stream) {
        const toolCall = extractToolCall(chunk);
        if (toolCall) {
          toolCalls.push(toolCall);
          deps.onToolCall?.(toolCall);
          continue;
        }

        const text = extractText(chunk);
        if (text) {
          answer += text;
          deps.onDelta(text);
        }
      }

      return {
        answer,
        toolCalls,
      };
    })
    .addNode("recoverNode", async (state) => {
      if (!deps.retrieveRelevantChunks) {
        return { attempt: state.attempt + 1 };
      }

      try {
        const recovered = await deps.retrieveRelevantChunks(buildRecoveryQuery(state));
        return {
          context: recovered.map((chunk) => ({
            title: chunk.title,
            path: chunk.path,
            heading: chunk.heading,
            content: chunk.content,
          })),
          attempt: state.attempt + 1,
        };
      } catch (error) {
        console.error("[agent] graph recovery retrieval failed", error);
        return { attempt: state.attempt + 1 };
      }
    })
    .addNode("finishNode", (state) => {
      const answer =
        state.answer.trim() ||
        (state.locale === "zh"
          ? "Wiki 中没有找到足够的信息来回答这个问题。"
          : "The wiki does not contain enough information to answer this question.");

      if (!state.answer.trim()) {
        deps.onDelta(answer);
      }

      return { answer };
    })
    .addEdge(START, "prepareNode")
    .addEdge("prepareNode", "answerNode")
    .addConditionalEdges("answerNode", routeAfterAnswer, {
      recoverNode: "recoverNode",
      finishNode: "finishNode",
    })
    .addEdge("recoverNode", "answerNode")
    .addEdge("finishNode", END)
    .compile({ name: "luckywiki-qa" });

  return graph;
}

function extractToolCall(chunk: unknown): AgentToolCallEvent | null {
  if (Array.isArray(chunk)) {
    for (const item of chunk) {
      const event = extractToolCall(item);
      if (event) return event;
    }
    return null;
  }

  if (!chunk || typeof chunk !== "object") return null;
  const value = chunk as Record<string, unknown>;
  if (typeof value.tool_call_id !== "string" || typeof value.name !== "string") {
    return null;
  }

  return {
    name: value.name,
    label: TOOL_LABELS[value.name] ?? value.name,
    summary: buildToolSummary(value.name, value.content),
  };
}

function buildToolSummary(name: string, rawContent: unknown) {
  if (typeof rawContent !== "string") return "";

  try {
    const data = JSON.parse(rawContent) as Record<string, unknown>;
    const count = (key: string) => (Array.isArray(data[key]) ? data[key].length : 0);

    switch (name) {
      case "search_wiki_knowledge":
        return count("chunks") || count("sources")
          ? `找到 ${count("chunks") || count("sources")} 篇相关文章`
          : "未找到相关文章";
      case "search_wiki_paths":
        return `找到 ${count("matches")} 个匹配路径`;
      case "list_recent_wiki_articles":
        return `列出 ${count("articles")} 篇最近文章`;
      case "get_related_wiki_articles":
        return `找到 ${count("articles")} 篇相关文章`;
      case "list_wiki_categories":
        return `列出 ${count("categories")} 个分类`;
      case "get_wiki_article_details":
        return data.found ? `获取文章: ${String(data.path ?? "")}` : "未找到文章";
      default:
        return "";
    }
  } catch {
    return "";
  }
}

function extractText(chunk: unknown): string {
  if (!chunk) return "";
  if (Array.isArray(chunk)) return chunk.map(extractText).join("");
  if (typeof chunk === "string") return chunk;
  if (typeof chunk !== "object") return "";

  const value = chunk as Record<string, unknown>;
  if (typeof value.tool_call_id === "string") return "";
  if (typeof value.text === "string") return value.text;
  if (typeof value.content === "string") return value.content;
  if (!Array.isArray(value.content)) return "";

  return value.content
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      const block = part as Record<string, unknown>;
      return typeof block.text === "string"
        ? block.text
        : typeof block.content === "string"
          ? block.content
          : "";
    })
    .join("");
}
