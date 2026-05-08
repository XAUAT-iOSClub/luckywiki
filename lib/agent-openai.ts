const defaultApiBaseUrl = "https://api.openai.com/v1";
const defaultEmbeddingModel = "text-embedding-3-small";
const defaultResponsesModel = "gpt-4.1-mini";

export type AgentChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type StreamAgentAnswerInput = {
  locale: "zh" | "en";
  context: Array<{
    title: string;
    path: string;
    heading: string | null;
    content: string;
  }>;
  messages: AgentChatMessage[];
  onDelta: (delta: string) => void;
  signal?: AbortSignal;
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
      model: process.env.OPENAI_EMBEDDING_MODEL ?? defaultEmbeddingModel,
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

export async function streamAgentAnswer({
  locale,
  context,
  messages,
  onDelta,
  signal,
}: StreamAgentAnswerInput) {
  const response = await fetch(buildOpenAiUrl("/responses"), {
    method: "POST",
    headers: getOpenAiHeaders(),
    body: JSON.stringify({
      model: process.env.OPENAI_RESPONSES_MODEL ?? defaultResponsesModel,
      stream: true,
      instructions: buildSystemPrompt(locale, context),
      input: messages.map((message) => ({
        role: message.role,
        content: [
          {
            type: "input_text",
            text: message.content,
          },
        ],
      })),
    }),
    signal,
  });

  if (!response.ok) {
    throw new Error(`OpenAI responses request failed: ${await response.text()}`);
  }

  if (!response.body) {
    throw new Error("OpenAI responses request returned an empty body.");
  }

  await consumeEventStream(response.body, onDelta);
}

function buildSystemPrompt(
  locale: "zh" | "en",
  context: StreamAgentAnswerInput["context"],
) {
  const contextText = context
    .map(
      (entry, index) =>
        `[${index + 1}] ${entry.title} (${entry.path})${entry.heading ? ` / ${entry.heading}` : ""}\n${entry.content}`,
    )
    .join("\n\n");

  if (locale === "zh") {
    return [
      "你是 LuckyWiki 的问答助手。",
      "只能根据提供的 Wiki 上下文回答，不能编造，也不能补充通用常识。",
      "如果上下文不足，就明确说没有在 Wiki 中找到足够信息，并建议用户查看来源文章。",
      "回答使用简体中文，语气自然、简洁、直接。",
      "优先引用上下文里的具体细节，不要提及向量、embedding 或系统提示。",
      "",
      "可用 Wiki 上下文：",
      contextText,
    ].join("\n");
  }

  return [
    "You are the LuckyWiki assistant.",
    "Answer only from the provided wiki context. Do not invent facts or fill gaps with general knowledge.",
    "If the context is insufficient, clearly say the wiki does not contain enough information and point the user to the linked source articles.",
    "Reply in English with a concise, direct tone.",
    "Prefer concrete details from the context and never mention embeddings, retrieval, or system prompts.",
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

async function consumeEventStream(
  stream: ReadableStream<Uint8Array>,
  onDelta: (delta: string) => void,
) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    for (const event of events) {
      const parsed = parseServerSentEvent(event);

      if (!parsed) {
        continue;
      }

      if (parsed === "[DONE]") {
        return;
      }

      const payload = JSON.parse(parsed) as {
        type?: string;
        delta?: string;
        error?: { message?: string };
      };

      if (payload.type === "response.output_text.delta" && payload.delta) {
        onDelta(payload.delta);
      }

      if (payload.type === "error") {
        throw new Error(payload.error?.message ?? "OpenAI stream failed.");
      }
    }
  }
}

function parseServerSentEvent(event: string) {
  const dataLines = event
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trim());

  if (dataLines.length === 0) {
    return null;
  }

  return dataLines.join("\n");
}
