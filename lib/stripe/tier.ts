import type { SubscriptionTier } from "@/lib/quota";

/**
 * Pure decision logic for "what tier should this account be on, given this
 * subscription's current status and price" — pulled out of the webhook
 * handler so it's unit-testable without mocking Stripe or Supabase.
 *
 * Any status other than one of `activeStatuses` (e.g. canceled, unpaid,
 * incomplete_expired, paused) resolves to "free" — a lapsed or cancelled
 * subscription always downgrades, it never just keeps the old tier.
 */
export function resolveTierForSubscription(params: {
  status: string;
  priceId: string | undefined;
  activeStatuses: readonly string[];
  priceToTier: Record<string, Exclude<SubscriptionTier, "free">>;
}): SubscriptionTier {
  const { status, priceId, activeStatuses, priceToTier } = params;
  const isActive = activeStatuses.includes(status);
  const tier = isActive && priceId ? priceToTier[priceId] : undefined;
  return tier ?? "free";
}
