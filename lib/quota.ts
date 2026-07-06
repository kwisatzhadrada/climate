import type { SupabaseClient } from "@supabase/supabase-js";

export type SubscriptionTier = "free" | "premium" | "business";

interface TierLimits {
  maxProperties: number;
  maxReportsPerMonth: number;
}

/**
 * Hard caps enforced server-side regardless of any rate limiter's
 * availability. This is the actual financial backstop — a script hammering
 * the report endpoint, or a paying-but-compromised account, can never cost
 * more than `maxReportsPerMonth * (cost per AI call)` per user per month.
 * Tune these once you know real AI cost-per-report and margin.
 */
export const TIER_LIMITS: Record<SubscriptionTier, TierLimits> = {
  free: { maxProperties: 1, maxReportsPerMonth: 3 },
  premium: { maxProperties: 5, maxReportsPerMonth: 100 },
  business: { maxProperties: 50, maxReportsPerMonth: 1000 },
};

export class QuotaExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuotaExceededError";
  }
}

export async function getSubscriptionTier(
  supabase: SupabaseClient,
  userId: string
): Promise<SubscriptionTier> {
  const { data } = await supabase
    .from("profiles")
    .select("subscription_tier")
    .eq("id", userId)
    .single();

  const tier = data?.subscription_tier as SubscriptionTier | undefined;
  return tier && tier in TIER_LIMITS ? tier : "free";
}

export async function assertWithinPropertyQuota(
  supabase: SupabaseClient,
  userId: string,
  tier: SubscriptionTier
): Promise<void> {
  const { maxProperties } = TIER_LIMITS[tier];
  const { count, error } = await supabase
    .from("properties")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (error) throw error;

  if ((count ?? 0) >= maxProperties) {
    throw new QuotaExceededError(
      `Your ${tier} plan allows up to ${maxProperties} propert${maxProperties === 1 ? "y" : "ies"}. Upgrade to add more.`
    );
  }
}

export async function assertWithinReportQuota(
  supabase: SupabaseClient,
  userId: string,
  tier: SubscriptionTier
): Promise<void> {
  const { maxReportsPerMonth } = TIER_LIMITS[tier];
  const since = new Date();
  since.setDate(since.getDate() - 30);

  const { count, error } = await supabase
    .from("risk_reports")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", since.toISOString());

  if (error) throw error;

  if ((count ?? 0) >= maxReportsPerMonth) {
    throw new QuotaExceededError(
      `Your ${tier} plan allows ${maxReportsPerMonth} risk reports per rolling 30 days. Upgrade for more, or wait until your oldest report ages out.`
    );
  }
}
