import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  signPayload,
  WEBHOOK_EVENTS,
  type WebhookActor,
  type WebhookEventType,
  type WebhookPayload,
} from "./types";

export { WEBHOOK_EVENTS };
export type { WebhookActor, WebhookEventType, WebhookPayload } from "./types";

const MAX_RETRIES = 3;
const TIMEOUT_MS = 10_000;
const RETRY_DELAYS_MS = [1_000, 5_000, 15_000];

export async function dispatchWebhookEvent(
  event: WebhookEventType,
  article: { id: string; path: string; title: string; status?: string },
  actor?: WebhookActor | null,
) {
  try {
    const configs = await prisma.webhookConfig.findMany({
      where: { active: true, events: { has: event } },
    });

    if (configs.length === 0) return;

    const payload: WebhookPayload = {
      event,
      article,
      ...(actor ? { actor } : {}),
      timestamp: new Date().toISOString(),
    };
    const payloadJson = JSON.stringify(payload);

    // 并行投递所有匹配的 webhook
    await Promise.all(
      configs.map((config) =>
        deliverWithRetry(config.id, config.url, config.secret, event, payloadJson, payload.timestamp),
      ),
    );
  } catch (error) {
    // webhook 失败不应影响主流程（文章创建/更新/归档等）
    console.error("[webhook] dispatch failed:", error);
  }
}

/**
 * 在响应返回后派发 webhook。
 * 直接 `void dispatchWebhookEvent()` 的后台任务在 Vercel 上可能随函数终止被中断
 * （重试最长约 40 秒），`after()` 能保证它执行完。
 */
export function dispatchWebhookEventAfterResponse(
  event: WebhookEventType,
  article: { id: string; path: string; title: string; status?: string },
  actor?: WebhookActor | null,
) {
  after(() => dispatchWebhookEvent(event, article, actor));
}

async function deliverWithRetry(
  webhookId: string,
  url: string,
  secret: string,
  event: WebhookEventType,
  payloadJson: string,
  timestamp: string,
) {
  // 签名串为 `${timestamp}.${payloadJson}`，与 X-LuckyWiki-Timestamp 头配套校验
  const signature = signPayload(payloadJson, secret, timestamp);
  const startedAt = Date.now();

  let attempt = 0; // 已失败次数；attempt 0 = 首次尝试
  let lastError: string | null = null;
  let lastStatusCode: number | undefined;
  let success = false;

  while (true) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let clientError = false;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-LuckyWiki-Event": event,
          "X-LuckyWiki-Signature": signature,
          // 与请求体中的 timestamp 保持一致，便于接收方做重放校验
          "X-LuckyWiki-Timestamp": timestamp,
        },
        body: payloadJson,
        signal: controller.signal,
      });

      lastStatusCode = response.status;

      if (response.ok) {
        success = true;
        break;
      }

      lastError = `HTTP ${response.status}`;
      // 4xx 通常是 URL/鉴权配置错误，重试没有意义（429 限流除外）
      clientError =
        response.status >= 400 && response.status < 500 && response.status !== 429;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    } finally {
      clearTimeout(timeoutId);
    }

    if (clientError || attempt >= MAX_RETRIES) break;
    await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]));
    attempt++;
  }

  const durationMs = Date.now() - startedAt;
  const status = success ? "success" : "error";

  // 投递日志与 lastUsedAt 必须 await：deliverWithRetry 在 after() 里运行，
  // 浮动 Promise 可能在 Vercel 函数终止前来不及落库，导致投递记录丢失
  await Promise.all([
    prisma.webhookDeliveryLog
      .create({
        data: {
          webhookId,
          event,
          payload: payloadJson.length > 10_000 ? payloadJson.slice(0, 10_000) + "..." : payloadJson,
          status,
          statusCode: lastStatusCode,
          error: lastError,
          durationMs,
          retries: attempt,
        },
      })
      .catch((e) => console.error("[webhook] failed to write delivery log:", e)),
    prisma.webhookConfig
      .update({ where: { id: webhookId }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined),
  ]);
}
