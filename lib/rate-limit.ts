import "server-only";

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};

export class RateLimitConfigurationError extends Error {
  constructor() {
    super("Distributed rate limiting is not configured.");
  }
}

const limiters = new Map<string, Ratelimit>();

export async function checkDistributedRateLimit(
  namespace: string,
  identity: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const limiter = getLimiter(namespace, limit, windowMs);
  const result = await limiter.limit(identity);
  return {
    allowed: result.success,
    remaining: result.remaining,
    resetAt: result.reset,
  };
}

export function getClientIp(headers: Headers): string {
  const forwarded = headers.get("x-vercel-forwarded-for") ?? headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "unknown";
}

function getLimiter(namespace: string, limit: number, windowMs: number) {
  const key = `${namespace}:${limit}:${windowMs}`;
  const existing = limiters.get(key);
  if (existing) return existing;

  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    throw new RateLimitConfigurationError();
  }

  const limiter = new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(limit, toDuration(windowMs)),
    prefix: `luckywiki:${namespace}`,
  });
  limiters.set(key, limiter);
  return limiter;
}

function toDuration(windowMs: number): `${number} s` | `${number} m` {
  if (windowMs % 60_000 === 0) return `${windowMs / 60_000} m`;
  return `${Math.ceil(windowMs / 1_000)} s`;
}
