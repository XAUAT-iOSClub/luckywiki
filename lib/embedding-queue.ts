import { send } from "@vercel/queue";

export const EMBEDDING_QUEUE_TOPIC = "article-embedding-sync";

export type EmbeddingSyncMessage = {
  articleId: string;
  updatedAt: string;
};

export async function enqueueArticleEmbeddingSync(message: EmbeddingSyncMessage) {
  await send(EMBEDDING_QUEUE_TOPIC, message, {
    idempotencyKey: `${message.articleId}:${message.updatedAt}`,
    retentionSeconds: 86_400,
  });
}
