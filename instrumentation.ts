/**
 * Next.js instrumentation hook — runs once when the server process boots
 * (both `next dev` and a real deployment), before the first request is
 * handled. Used to fail loudly, immediately, in server logs if a production
 * deployment is missing required config, rather than only surfacing the
 * problem lazily on whichever request happens to hit it first.
 *
 * Requires `experimental.instrumentationHook: true` in next.config.js on
 * Next 14 (stable by default in Next 15+).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { logProductionEnvCheckOnce } = await import("@/lib/env");
    logProductionEnvCheckOnce();
  }
}
