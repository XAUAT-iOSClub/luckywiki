import { createHmac } from "node:crypto";

export const WEBHOOK_EVENTS = {
  ARTICLE_CREATED: "article.created",
  ARTICLE_PUBLISHED: "article.published",
  ARTICLE_UPDATED: "article.updated",
  ARTICLE_ARCHIVED: "article.archived",
  ARTICLE_RESTORED: "article.restored",
  ARTICLE_DELETED: "article.deleted",
} as const;

export type WebhookEventType = (typeof WEBHOOK_EVENTS)[keyof typeof WEBHOOK_EVENTS];

/** 触发本次事件的操作账号 */
export type WebhookActor = {
  id: string;
  name: string;
  email: string;
};

export type WebhookPayload = {
  event: WebhookEventType;
  article: {
    id: string;
    path: string;
    title: string;
    status?: string;
  };
  /** 操作人；系统任务或全局 API Key 触发时可能为空 */
  actor?: WebhookActor;
  timestamp: string;
};

/**
 * 签名串 = `${timestamp}.${payload}`（Stripe 风格）。
 * 时间戳参与签名，接收方既能校验时间窗抵御重放，也能防止 header 与 body 被分开篡改。
 */
export function signPayload(payload: string, secret: string, timestamp: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
}
