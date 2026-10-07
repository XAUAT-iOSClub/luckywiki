import { ArticleStatus } from "@/generated/prisma/enums";
import { buildArticleChunks, type ChunkableArticle } from "@/lib/agent/chunks";
import { getEmbeddingDimensions } from "@/lib/agent/embedding-dimensions";
import { embedTexts, isAgentConfigured } from "@/lib/agent/openai";

export type AgentChunkRecord = {
  chunkIndex: number;
  heading: string | null;
  content: string;
  embedding: number[];
};

export type AgentChunkRepository = {
  deleteArticleChunks: (articleId: string) => Promise<void>;
  replaceArticleChunks: (articleId: string, records: AgentChunkRecord[]) => Promise<void>;
};

export async function syncArticleEmbeddingsWithRepository({
  article,
  repository,
  embed = embedTexts,
  enabled = isAgentConfigured(),
}: {
  article: ChunkableArticle;
  repository: AgentChunkRepository;
  embed?: (texts: string[]) => Promise<number[][]>;
  enabled?: boolean;
}) {
  if (article.status !== ArticleStatus.PUBLISHED) {
    await repository.deleteArticleChunks(article.id);
    return { chunkCount: 0, skipped: false };
  }

  const chunks = buildArticleChunks(article);

  if (chunks.length === 0) {
    await repository.deleteArticleChunks(article.id);
    return { chunkCount: 0, skipped: false };
  }

  if (!enabled) {
    return { chunkCount: 0, skipped: true };
  }

  const embeddings = await embed(
    chunks.map((chunk) =>
      `${article.title}\n${article.path}${chunk.heading ? `\n${chunk.heading}` : ""}\n${chunk.content}`,
    ),
  );

  if (embeddings.length !== chunks.length) {
    throw new Error(
      `Embedding provider returned ${embeddings.length} vectors for ${chunks.length} chunks.`,
    );
  }

  const dimensions = getEmbeddingDimensions();

  const records = chunks.map((chunk, index) => ({
    embedding: embeddings[index] ?? [],
    chunkIndex: chunk.chunkIndex,
    heading: chunk.heading,
    content: chunk.content,
  }));

  for (const record of records) {
    if (record.embedding.length !== dimensions) {
      throw new Error(
        `Embedding provider returned ${record.embedding.length} dimensions; expected ${dimensions}.`,
      );
    }
  }

  await repository.replaceArticleChunks(article.id, records);
  return { chunkCount: records.length, skipped: false };
}
