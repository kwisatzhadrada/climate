import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { isProductionRuntime, logProductionEnvCheckOnce } from "@/lib/env";

/**
 * Burst/abuse protection, distinct from the hard monthly quota in lib/quota.ts.
 * This guards against e.g. a script firing 50 requests/second; the monthly
 * quota is what guarantees a bounded dollar cost per account.
 *
 * Uses Upstash Redis (serverless-friendly, works across Vercel instances) when
 * configured. Without it:
 *   - in development, falls back to an in-memory sliding window (correct only
 *     for a single running instance, which is exactly what `next dev` is);
 *   - in production, FAILS CLOSED — checkRateLimit throws
 *     RateLimitingUnavailableError instead of silently running unprotected.
 *     Callers (the report-generation, property-create, and checkout routes)
 *     turn that into an HTTP 503 rather than letting requests through.
 */

export class RateLimitingUnavailableError extends Error {
  constructor() {
    super(
      "Rate limiting is not configured for this production deployment. Set " +
        "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN — see README.md > " +
        "'Production deployment checklist'. This endpoint refuses requests until then."
    );
    this.name = "RateLimitingUnavailableError";
  }
}

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

  if (isProductionRuntime()) {
    logProductionEnvCheckOnce();
    throw new RateLimitingUnavailableError();
  }

  if (!warnedAboutFallback) {
    warnedAboutFallback = true;
    console.warn(
      "[rateLimit] UPSTASH_REDIS_REST_URL/TOKEN not set — using in-memory rate limiting. " +
        "This is fine for local dev only; production fails closed instead of falling back."
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

/**
 * Shared route guard: returns an error payload to send as the response body
 * if the request should be rejected (either genuinely rate-limited, or — in
 * production only — because rate limiting itself isn't configured), or
 * `null` if the caller should proceed. Keeps the fail-closed behavior
 * identical across every endpoint that calls it instead of re-implementing
 * the try/catch in each route.
 */
export async function enforceRateLimit(
  identifier: string,
  config: RateLimitConfig
): Promise<{ error: string; status: number } | null> {
  try {
    const result = await checkRateLimit(identifier, config);
    if (!result.success) {
      return { error: "Too many requests. Please slow down and try again shortly.", status: 429 };
    }
    return null;
  } catch (err) {
    if (err instanceof RateLimitingUnavailableError) {
      return { error: err.message, status: 503 };
    }
    throw err;
  }
}
