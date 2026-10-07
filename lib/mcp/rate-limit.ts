/**
 * MCP 限流
 * 基于 Upstash Redis 的跨实例滑动窗口限流。
 */
import { checkDistributedRateLimit } from "@/lib/rate-limit";

// 默认每小时 200 次（李哥说"先试试 200"）
const DEFAULT_LIMIT = 200;
const DEFAULT_WINDOW_MS = 60 * 60 * 1000; // 1小时

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
