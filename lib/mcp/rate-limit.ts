/**
 * MCP 限流
 * 基于 Upstash Redis 的跨实例滑动窗口限流。
 */
import { NextResponse } from "next/server";
import { checkDistributedRateLimit } from "@/lib/rate-limit";
import { getIdentityKey, type McpIdentity } from "./auth";

// 默认每小时 200 次（李哥说"先试试 200"）
const DEFAULT_LIMIT = 200;
const DEFAULT_WINDOW_MS = 60 * 60 * 1000; // 1小时

// 匿名访问公开 API 的限额
const ANONYMOUS_LIMIT = 60;

export async function checkRateLimit(
  identity: string,
  limit: number = DEFAULT_LIMIT,
  windowMs: number = DEFAULT_WINDOW_MS,
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  return checkDistributedRateLimit("mcp", identity, limit, windowMs);
}

export function getRateLimitConfig(): { limit: number; windowMs: number } {
  const envLimit = Number(process.env.MCP_RATE_LIMIT);
  const limit = Number.isFinite(envLimit) && envLimit > 0 ? envLimit : DEFAULT_LIMIT;
  return { limit, windowMs: DEFAULT_WINDOW_MS };
}

/**
 * 匿名调用者按客户端 IP 分桶。
 * Vercel 会在 x-forwarded-for 里写入真实来源，取第一段即可。
 */
function getClientIp(request?: Request): string {
  const forwarded = request?.headers.get("x-forwarded-for");
  const ip =
    forwarded?.split(",")[0]?.trim() ||
    request?.headers.get("x-real-ip")?.trim();
  return ip || "unknown";
}

/**
 * 公开 /api/v1 只读接口限流。
 * 返回 null 表示放行；否则返回限流重置时间戳（用于 429 响应）。
 * Redis 不可用时静默放行（本地开发）。
 */
export async function checkPublicApiRateLimit(
  identity: McpIdentity | null,
  request?: Request,
): Promise<number | null> {
  try {
    if (!identity) {
      // 匿名用户按 IP 各自计数，避免所有人共用一个全局配额
      const result = await checkRateLimit(
        `anonymous:${getClientIp(request)}`,
        ANONYMOUS_LIMIT,
        DEFAULT_WINDOW_MS,
      );
      return result.allowed ? null : result.resetAt;
    }

    // rateLimit 为 null 表示该 Key 未配置限额
    if (identity.rateLimit === null) {
      return null;
    }

    const config = getRateLimitConfig();
    const result = await checkRateLimit(
      getIdentityKey(identity),
      identity.rateLimit,
      config.windowMs,
    );
    return result.allowed ? null : result.resetAt;
  } catch {
    return null;
  }
}

/** 429 响应助手 */
export function rateLimitExceededResponse(resetAt: number) {
  return NextResponse.json(
    { error: "Rate limit exceeded", resetAt },
    { status: 429, headers: { "Retry-After": Math.ceil((resetAt - Date.now()) / 1000).toString() } },
  );
}
