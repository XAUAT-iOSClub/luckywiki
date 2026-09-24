import { RagRateLimitError } from "@/lib/rag/errors";

const HOUR = 60 * 60 * 1000;

interface RateBucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, RateBucket>();

function cleanup(now: number) {
  if (buckets.size < 5000) return;

  for (const [key, value] of buckets.entries()) {
    if (value.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

export function checkRagRateLimit(
  identity: string,
  hourlyLimit: number,
): void {
  const now = Date.now();
  const windowStart = Math.floor(now / HOUR) * HOUR;
  const key = `${identity}:${windowStart}`;

  const bucket = buckets.get(key);

  if (!bucket) {
    buckets.set(key, {
      count: 1,
      resetAt: windowStart + HOUR,
    });
    cleanup(now);
    return;
  }

  if (bucket.count >= hourlyLimit) {
    throw new RagRateLimitError(bucket.resetAt);
  }

  bucket.count += 1;
}
