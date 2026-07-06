import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/**
 * Burst/abuse protection, distinct from the hard monthly quota in lib/quota.ts.
 * This guards against e.g. a script firing 50 requests/second; the monthly
 * quota is what guarantees a bounded dollar cost per account.
 *
 * Uses Upstash Redis (serverless-friendly, works across Vercel instances) when
 * configured. Without it, falls back to an in-memory sliding window that is
 * ONLY correct for a single running instance — fine for local dev, not a
 * substitute for Upstash in a multi-instance production deployment. A warning
 * is logged once so this doesn't fail silently.
 */

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

let warnedAboutFallback = false;

const limiterCache = new Map<string, Ratelimit>();

function getRedisLimiter(limit: number, windowSeconds: number): Ratelimit {
  const cacheKey = `${limit}:${windowSeconds}`;
  let limiter = limiterCache.get(cacheKey);
  if (!limiter) {
    limiter = new Ratelimit({
      redis: redis!,
      limiter: Ratelimit.slidingWindow(limit, `${windowSeconds} s`),
      analytics: false,
      prefix: "resilience-platform:ratelimit",
    });
    limiterCache.set(cacheKey, limiter);
  }
  return limiter;
}

const memoryStore = new Map<string, number[]>();

function memoryLimit(
  key: string,
  limit: number,
  windowMs: number
): { success: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const timestamps = (memoryStore.get(key) ?? []).filter((t) => now - t < windowMs);

  if (timestamps.length >= limit) {
    return { success: false, remaining: 0, resetAt: timestamps[0] + windowMs };
  }

  timestamps.push(now);
  memoryStore.set(key, timestamps);
  return { success: true, remaining: limit - timestamps.length, resetAt: now + windowMs };
}

export interface RateLimitConfig {
  limit: number;
  windowSeconds: number;
}

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetAt: number;
  usedFallback: boolean;
}

export async function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  if (redis) {
    const limiter = getRedisLimiter(config.limit, config.windowSeconds);
    const { success, remaining, reset } = await limiter.limit(identifier);
    return { success, remaining, resetAt: reset, usedFallback: false };
  }

  if (!warnedAboutFallback) {
    warnedAboutFallback = true;
    console.warn(
      "[rateLimit] UPSTASH_REDIS_REST_URL/TOKEN not set — using in-memory rate limiting. " +
        "This does NOT protect a multi-instance production deployment. Configure Upstash before public launch."
    );
  }

  const key = `${identifier}:${config.limit}:${config.windowSeconds}`;
  return { ...memoryLimit(key, config.limit, config.windowSeconds * 1000), usedFallback: true };
}

/** Preset burst-guard configs for specific endpoints. */
export const RATE_LIMITS = {
  riskReportGenerate: { limit: 5, windowSeconds: 60 },
  propertyCreate: { limit: 10, windowSeconds: 60 },
  stripeCheckout: { limit: 10, windowSeconds: 60 },
} satisfies Record<string, RateLimitConfig>;
