import { prisma } from "@/lib/prisma";
import { randomUUID } from "node:crypto";
import { ArticleStatus } from "@/generated/prisma/enums";
import {
  type AgentChunkRepository,
  type AgentChunkRecord,
  syncArticleEmbeddingsWithRepository,
} from "@/lib/agent/index-core";

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
    await replaceChunksWithRetry(articleId, records);
  },
};

async function replaceChunksWithRetry(
  articleId: string,
  records: AgentChunkRecord[],
) {
  const maxWait = positiveMilliseconds(
    process.env.PRISMA_TRANSACTION_MAX_WAIT_MS,
    15_000,
  );
  const timeout = positiveMilliseconds(
    process.env.PRISMA_TRANSACTION_TIMEOUT_MS,
    60_000,
  );

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      // ParadeDB deployments commonly sit behind a pooler and can take a few
      // seconds to hand out a transaction. Prisma's default maxWait is 2s.
      await prisma.$transaction(async (transaction) => {
        await transaction.agentChunk.deleteMany({ where: { articleId } });

        for (const record of records) {
          await transaction.$executeRaw`
            INSERT INTO "agent_chunks" (
              "id", "article_id", "chunk_index", "heading", "content",
              "embedding", "created_at", "updated_at"
            ) VALUES (
              ${randomUUID()}, ${articleId}, ${record.chunkIndex}, ${record.heading}, ${record.content},
              ${JSON.stringify(record.embedding)}::vector, NOW(), NOW()
            )
          `;
        }
      }, { maxWait, timeout });
      return;
    } catch (error) {
      if (attempt === 2 || !isRetryableTransactionError(error)) {
        throw error;
      }

      if (isClosedConnectionError(error)) {
        await prisma.$disconnect().catch(() => undefined);
        await prisma.$connect().catch(() => undefined);
      }

      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }
}

function isRetryableTransactionError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    /unable to start a transaction|transaction.*time|timed out/i.test(message) ||
    isClosedConnectionError(error)
  );
}

function isClosedConnectionError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /connection terminated unexpectedly|server has closed the connection|connection was closed/i.test(
    message,
  );
}

function positiveMilliseconds(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
