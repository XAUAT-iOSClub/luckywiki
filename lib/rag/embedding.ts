import { normalizeOpenAiBaseUrl } from "@/lib/agent/openai";

export async function getQueryEmbedding(
  query: string,
): Promise<number[] | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const baseUrl = normalizeOpenAiBaseUrl(
    process.env.OPENAI_API_BASE_URL ?? "https://api.openai.com/v1",
  );

  const model =
    process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";

  const dimensions = Number(process.env.AGENT_EMBEDDING_DIMENSIONS ?? 1024);

  try {
    const response = await fetch(`${baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: query,
        dimensions,
      }),
    });

    if (!response.ok) {
      console.error("[rag] embedding request failed", response.status);
      return null;
    }

    const data = (await response.json()) as {
      data?: Array<{ embedding?: number[] }>;
    };

    const embedding = data.data?.[0]?.embedding;

    if (!embedding || embedding.length !== dimensions) {
      console.error("[rag] embedding dimension mismatch");
      return null;
    }

    return embedding;
  } catch (error) {
    console.error("[rag] embedding failed", error);
    return null;
  }
}
