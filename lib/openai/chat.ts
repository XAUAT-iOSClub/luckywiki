import { buildOpenAiUrl, getOpenAiHeaders } from "@/lib/openai/base-url";

const defaultChatModel = "gpt-4.1-mini";

export type CreateChatCompletionInput = {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
};

export function extractChatCompletionText(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const choices = (payload as { choices?: unknown }).choices;

  if (!Array.isArray(choices) || choices.length === 0) {
    return "";
  }

  const choice = choices[0];

  if (!choice || typeof choice !== "object") {
    return "";
  }

  const message = (choice as { message?: unknown }).message;

  if (message && typeof message === "object") {
    const content = (message as { content?: unknown }).content;

    if (typeof content === "string") {
      return content;
    }

    if (Array.isArray(content)) {
      return content
        .map((part) => {
          if (!part || typeof part !== "object") {
            return "";
          }

          const text = (part as { text?: unknown }).text;
          return typeof text === "string" ? text : "";
        })
        .join("");
    }
  }

  const legacyText = (choice as { text?: unknown }).text;
  return typeof legacyText === "string" ? legacyText : "";
}

export async function createChatCompletion({
  systemPrompt,
  userPrompt,
  maxTokens = 600,
  temperature = 0.2,
  signal,
  env = process.env,
  fetchImpl = fetch,
}: CreateChatCompletionInput): Promise<string> {
  const timeout = AbortSignal.timeout(30_000);
  const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let response: Response;

  try {
    response = await fetchImpl(buildOpenAiUrl("/chat/completions", env), {
      method: "POST",
      headers: getOpenAiHeaders(env),
      body: JSON.stringify({
        model: env.OPENAI_RESPONSES_MODEL?.trim() || defaultChatModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature,
        max_tokens: maxTokens,
      }),
      signal: requestSignal,
    });
  } catch (error) {
    if (timeout.aborted && !signal?.aborted) {
      throw new Error("OpenAI chat completion request timed out after 30000ms.", {
        cause: error,
      });
    }
    throw error;
  }

  if (!response.ok) {
    const details = (await response.text()).slice(0, 500);
    throw new Error(`OpenAI chat completion request failed: ${details}`);
  }

  const payload = (await response.json()) as unknown;
  const text = extractChatCompletionText(payload);

  if (!text.trim()) {
    throw new Error("OpenAI returned an empty summary.");
  }

  return text;
}
