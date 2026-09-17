import { RateLimit } from "@/lib/db/models/RateLimit";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export async function checkRateLimit(
  identifier: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const windowStart = Math.floor(Date.now() / windowMs) * windowMs;
  const windowEnd = windowStart + windowMs;
  const key = `${identifier}:${windowStart}`;

  const doc = await RateLimit.findOneAndUpdate(
    { key },
    { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(windowEnd) } },
    { upsert: true, new: true },
  );

  return {
    allowed: doc.count <= limit,
    remaining: Math.max(0, limit - doc.count),
    retryAfterSeconds: Math.max(0, Math.ceil((windowEnd - Date.now()) / 1000)),
  };
}
