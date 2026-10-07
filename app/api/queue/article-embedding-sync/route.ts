import { handleCallback } from "@vercel/queue";
import { z } from "zod";
import { syncArticleEmbeddingsForArticleId } from "@/lib/agent/index";
import type { EmbeddingSyncMessage } from "@/lib/embedding-queue";
import { prisma } from "@/lib/prisma";

const messageSchema = z.object({
  articleId: z.string().min(1),
  updatedAt: z.string().datetime(),
});

export const maxDuration = 300;

export const POST = handleCallback<EmbeddingSyncMessage>(
  async (message) => {
    const parsed = messageSchema.parse(message);
    const article = await prisma.article.findUnique({
      where: { id: parsed.articleId },
      select: { updatedAt: true },
    });

    if (!article || article.updatedAt.toISOString() !== parsed.updatedAt) {
      return;
    }

    await syncArticleEmbeddingsForArticleId(parsed.articleId);
  },
  {
    visibilityTimeoutSeconds: 300,
    retry: (_error, metadata) => {
      if (metadata.deliveryCount >= 5) return { acknowledge: true };
      return { afterSeconds: Math.min(300, 2 ** metadata.deliveryCount * 5) };
    },
  },
);
