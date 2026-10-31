import { send } from "@vercel/queue";

export const EMBEDDING_QUEUE_TOPIC = "article-embedding-sync";

export type EmbeddingSyncMessage = {
  articleId: string;
  updatedAt: string;
};

export async function enqueueArticleEmbeddingSync(message: EmbeddingSyncMessage) {
  // 非 Vercel 环境（本地开发/自托管）拿不到 Queue 的 OIDC 凭证，入队必然失败。
  // 这里直接跳过，避免异常打断创建/更新/归档/恢复/发布等主流程（含 webhook 派发）。
  if (!process.env.VERCEL) {
    return;
  }

  await send(EMBEDDING_QUEUE_TOPIC, message, {
    idempotencyKey: `${message.articleId}:${message.updatedAt}`,
    retentionSeconds: 86_400,
  });
}
