import { prisma } from "@/lib/prisma";
import { ArticleStatus } from "@/generated/prisma/enums";
import {
  type AgentChunkRepository,
  syncArticleEmbeddingsWithRepository,
} from "@/lib/agent-index-core";

export async function syncArticleEmbeddingsForArticleId(articleId: string) {
  const article = await prisma.article.findUnique({
    where: { id: articleId },
    select: {
      id: true,
      title: true,
      path: true,
      markdown: true,
      status: true,
    },
  });

  if (!article) {
    return;
  }

  return syncArticleEmbeddingsWithRepository({
    article,
    repository: prismaAgentChunkRepository,
  });
}

export async function reindexAllPublishedArticleEmbeddings() {
  const articles = await prisma.article.findMany({
    where: { status: ArticleStatus.PUBLISHED },
    select: {
      id: true,
      title: true,
      path: true,
      markdown: true,
      status: true,
    },
    orderBy: {
      path: "asc",
    },
  });

  const results = [];

  for (const article of articles) {
    results.push(
      await syncArticleEmbeddingsWithRepository({
        article,
        repository: prismaAgentChunkRepository,
      }),
    );
  }

  return results;
}

export async function safeSyncArticleEmbeddingsForArticleId(articleId: string) {
  try {
    await syncArticleEmbeddingsForArticleId(articleId);
  } catch (error) {
    console.error(
      "[agent] failed to sync article embeddings",
      error instanceof Error ? error.message : error,
    );
  }
}

const prismaAgentChunkRepository: AgentChunkRepository = {
  async deleteArticleChunks(articleId) {
    await prisma.agentChunk.deleteMany({
      where: { articleId },
    });
  },
  async replaceArticleChunks(articleId, records) {
    await prisma.$transaction([
      prisma.agentChunk.deleteMany({
        where: { articleId },
      }),
      prisma.agentChunk.createMany({
        data: records.map((record) => ({
          articleId,
          chunkIndex: record.chunkIndex,
          heading: record.heading,
          content: record.content,
          embedding: record.embedding,
        })),
      }),
    ]);
  },
};
