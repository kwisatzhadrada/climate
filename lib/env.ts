/**
 * Central place to decide "is this a real production deployment" and to
 * check for env vars that are optional in dev but mandatory in production.
 *
 * Vercel sets NODE_ENV=production for BOTH preview and production
 * deployments, so NODE_ENV alone can't distinguish them. VERCEL_ENV (when
 * present) is authoritative; fall back to NODE_ENV for non-Vercel hosts
 * (e.g. `next build && next start` on your own server).
 */
export function isProductionRuntime(): boolean {
  if (process.env.VERCEL_ENV) {
    return process.env.VERCEL_ENV === "production";
  }
  return process.env.NODE_ENV === "production";
}

function hasUpstashConfig(): boolean {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

export interface ProductionEnvCheck {
  ok: boolean;
  missing: string[];
}

/**
 * Checks env vars that are required once `isProductionRuntime()` is true.
 * Currently just Upstash (rate limiting), but structured as a list so more
 * can be added here later without touching call sites.
 */
export function checkProductionEnv(): ProductionEnvCheck {
  if (!isProductionRuntime()) {
    return { ok: true, missing: [] };
  }

  const missing: string[] = [];
  if (!hasUpstashConfig()) {
    missing.push("UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN");
  }

  return { ok: missing.length === 0, missing };
}

let hasLoggedStartupCheck = false;

/**
 * Logs a loud, impossible-to-miss warning at process boot (via
 * instrumentation.ts) if production is missing required config. Safe to call
 * more than once — only logs the first time per process.
 */
export function logProductionEnvCheckOnce(): void {
  if (hasLoggedStartupCheck) return;
  hasLoggedStartupCheck = true;

  const { ok, missing } = checkProductionEnv();
  if (ok) return;

  console.error(
    [
      "",
      "=".repeat(78),
      "FATAL (production configuration): missing required environment variable(s):",
      ...missing.map((m) => `  - ${m}`),
      "",
      "Report generation, property creation, and Stripe checkout will refuse",
      "requests (HTTP 503) until these are set, rather than silently running",
      "without abuse protection. See README.md > 'Production deployment checklist'.",
      "=".repeat(78),
      "",
    ].join("\n")
  );
}
