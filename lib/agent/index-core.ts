import { ArticleStatus } from "@/generated/prisma/enums";
import { buildArticleChunks, type ChunkableArticle } from "@/lib/agent/chunks";
import { embedTexts, isAgentConfigured } from "@/lib/agent/openai";

export type AgentChunkRecord = {
  chunkIndex: number;
  heading: string | null;
  content: string;
  embedding: string;
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

  const records = chunks.map((chunk, index) => ({
    chunkIndex: chunk.chunkIndex,
    heading: chunk.heading,
    content: chunk.content,
    embedding: JSON.stringify(embeddings[index] ?? []),
  }));

  await repository.replaceArticleChunks(article.id, records);
  return { chunkCount: records.length, skipped: false };
}
