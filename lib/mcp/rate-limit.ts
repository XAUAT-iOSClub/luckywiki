/**
 * MCP 限流
 * 基于内存的简单滑动窗口限流（单实例足够用，若后续多实例可换 Redis）
 */

type RateLimitEntry = {
  // 时间窗口起点
  windowStart: number;
  // 当前窗口已用次数
  count: number;
};

const store = new Map<string, RateLimitEntry>();

// 默认每小时 200 次（李哥说"先试试 200"）
const DEFAULT_LIMIT = 200;
const DEFAULT_WINDOW_MS = 60 * 60 * 1000; // 1小时

export function checkRateLimit(
  identity: string,
  limit: number = DEFAULT_LIMIT,
  windowMs: number = DEFAULT_WINDOW_MS,
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const entry = store.get(identity);

  if (!entry || now - entry.windowStart >= windowMs) {
    // 新窗口
    store.set(identity, { windowStart: now, count: 1 });
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs };
  }

  if (entry.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.windowStart + windowMs,
    };
  }

  entry.count += 1;
  return {
    allowed: true,
    remaining: limit - entry.count,
    resetAt: entry.windowStart + windowMs,
  };
}

export function getRateLimitConfig(): { limit: number; windowMs: number } {
  const envLimit = Number(process.env.MCP_RATE_LIMIT);
  const limit = Number.isFinite(envLimit) && envLimit > 0 ? envLimit : DEFAULT_LIMIT;
  return { limit, windowMs: DEFAULT_WINDOW_MS };
}

// 清理过期条目（避免内存泄漏，每小时跑一次）
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

export function startRateLimitCleanup() {
  if (cleanupTimer) return;
  const WINDOW_MS = DEFAULT_WINDOW_MS;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now - entry.windowStart >= WINDOW_MS) {
        store.delete(key);
      }
    }
  }, 60 * 60 * 1000); // 每小时
}
