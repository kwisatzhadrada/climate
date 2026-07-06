import { describe, expect, it } from "vitest";
import { resolveTierForSubscription } from "@/lib/stripe/tier";

const ACTIVE_STATUSES = ["active", "trialing"] as const;
const PRICE_TO_TIER = {
  price_premium_123: "premium",
  price_business_456: "business",
} as const;

describe("resolveTierForSubscription (webhook downgrade logic)", () => {
  it("grants the matching paid tier while the subscription is active", () => {
    expect(
      resolveTierForSubscription({
        status: "active",
        priceId: "price_premium_123",
        activeStatuses: ACTIVE_STATUSES,
        priceToTier: PRICE_TO_TIER,
      })
    ).toBe("premium");
  });

  it("still grants the tier during a trial", () => {
    expect(
      resolveTierForSubscription({
        status: "trialing",
        priceId: "price_business_456",
        activeStatuses: ACTIVE_STATUSES,
        priceToTier: PRICE_TO_TIER,
      })
    ).toBe("business");
  });

  it("downgrades to free when the subscription is cancelled", () => {
    expect(
      resolveTierForSubscription({
        status: "canceled",
        priceId: "price_premium_123",
        activeStatuses: ACTIVE_STATUSES,
        priceToTier: PRICE_TO_TIER,
      })
    ).toBe("free");
  });

  it("downgrades to free on non-payment (unpaid / past_due / incomplete_expired)", () => {
    for (const status of ["unpaid", "past_due", "incomplete_expired", "paused"]) {
      expect(
        resolveTierForSubscription({
          status,
          priceId: "price_premium_123",
          activeStatuses: ACTIVE_STATUSES,
          priceToTier: PRICE_TO_TIER,
        })
      ).toBe("free");
    }
  });

  it("downgrades to free if the price isn't one we recognize, even if active", () => {
    expect(
      resolveTierForSubscription({
        status: "active",
        priceId: "price_unknown_999",
        activeStatuses: ACTIVE_STATUSES,
        priceToTier: PRICE_TO_TIER,
      })
    ).toBe("free");
  });
});
