import { generateStructuredText, type ImageInput, type TokenUsage } from "@/lib/ai/client";
import { createServiceClient } from "@/lib/supabase/server";

const TIMEOUT_MS = 30_000;

// Rough $/1K-token pricing for cost observability, not billing — update as
// provider pricing changes. Unrecognized models are logged with a null cost
// rather than a guessed one.
const PRICING_PER_1K_TOKENS: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-5": { input: 0.003, output: 0.015 },
  "claude-opus-4": { input: 0.015, output: 0.075 },
  "gpt-4o": { input: 0.0025, output: 0.01 },
  "gpt-4o-mini": { input: 0.00015, output: 0.0006 },
};

export function estimateCostUsd(model: string, usage: TokenUsage | null): number | null {
  if (!usage) return null;
  const pricingKey = Object.keys(PRICING_PER_1K_TOKENS).find((key) => model.includes(key));
  if (!pricingKey) return null;
  const pricing = PRICING_PER_1K_TOKENS[pricingKey];
  return (usage.inputTokens / 1000) * pricing.input + (usage.outputTokens / 1000) * pricing.output;
}

export interface AIJobParams {
  /** Short slug identifying the calling feature, e.g. "climate_risk_report",
   * "food_water_plan" (Feature 2), "biosecurity_dashboard" (Feature 3). Keeps
   * every AI call in the app on one shared cost/usage ledger. */
  feature: string;
  userId: string;
  /** Optional foreign keys so ai_usage_log rows can be traced back to the
   * specific property/report they were generated for, not just the user. */
  propertyId?: string;
  system: string;
  prompt: string;
  image?: ImageInput;
}

export interface AIJobResult {
  text: string;
  model: string;
  provider: "anthropic" | "openai";
  /** id of the ai_usage_log row written for this call, if logging succeeded.
   * Callers that only learn a related id (e.g. the risk_reports row) after
   * this call returns can patch it in with `attachReportId`. */
  usageLogId: string | null;
}

/**
 * The single governed entry point for calling an AI provider. Every feature
 * (current and future — Feature 2/3 should call this too, not lib/ai/client
 * directly) gets, for free:
 *   - a hard timeout, so a hung provider request can't tie up a serverless
 *     invocation (and its billed duration) indefinitely
 *   - usage/cost logging to ai_usage_log, keyed by feature, user, and
 *     property (report is attached afterward — see attachReportId)
 *   - one consistent error shape
 *
 * Deliberately does NOT retry on failure — lib/ai/client.ts already falls
 * back to a second provider once, and a client-visible failure that lets the
 * user explicitly re-click "Generate report" is safer (and cheaper) than an
 * automatic retry loop silently doubling AI spend on a flaky request.
 */
export async function runAIJob(params: AIJobParams): Promise<AIJobResult> {
  const { feature, userId, propertyId, system, prompt, image } = params;
  const supabase = createServiceClient();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const result = await generateStructuredText({ system, prompt, image, signal: controller.signal });

    const usageLogId = await logUsage(supabase, {
      userId,
      feature,
      propertyId,
      provider: result.provider,
      model: result.model,
      usage: result.usage,
      succeeded: true,
      error: null,
    });

    return { text: result.text, model: result.model, provider: result.provider, usageLogId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    await logUsage(supabase, {
      userId,
      feature,
      propertyId,
      provider: "unknown",
      model: "unknown",
      usage: null,
      succeeded: false,
      error: message,
    });

    throw new Error(`AI job "${feature}" failed: ${message}`);
  } finally {
    clearTimeout(timeout);
  }
}

/** Links a previously-logged AI call to the report row it produced, once that
 * row exists (report creation happens after the AI call returns). */
export async function attachReportId(usageLogId: string | null, reportId: string): Promise<void> {
  if (!usageLogId) return;
  try {
    const supabase = createServiceClient();
    await supabase.from("ai_usage_log").update({ report_id: reportId }).eq("id", usageLogId);
  } catch (err) {
    console.error("[ai/service] failed to attach report_id to ai_usage_log:", err);
  }
}

async function logUsage(
  supabase: ReturnType<typeof createServiceClient>,
  entry: {
    userId: string;
    feature: string;
    propertyId?: string;
    provider: string;
    model: string;
    usage: TokenUsage | null;
    succeeded: boolean;
    error: string | null;
  }
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("ai_usage_log")
      .insert({
        user_id: entry.userId,
        property_id: entry.propertyId ?? null,
        feature: entry.feature,
        provider: entry.provider,
        model: entry.model,
        input_tokens: entry.usage?.inputTokens ?? null,
        output_tokens: entry.usage?.outputTokens ?? null,
        estimated_cost_usd: estimateCostUsd(entry.model, entry.usage),
        succeeded: entry.succeeded,
        error: entry.error,
      })
      .select("id")
      .single();

    if (error) throw error;
    return data.id as string;
  } catch (err) {
    // Observability should never take down the actual feature.
    console.error("[ai/service] failed to write ai_usage_log:", err);
    return null;
  }
}
