import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  assertWithinPropertyQuota,
  assertWithinReportQuota,
  getSubscriptionTier,
  QuotaExceededError,
  TIER_LIMITS,
} from "@/lib/quota";
import { makeSupabaseMock } from "./mockSupabase";

describe("property quota (free: max 1 property)", () => {
  it("allows creating the first property", async () => {
    const supabase = makeSupabaseMock({ count: 0, error: null }) as unknown as SupabaseClient;
    await expect(assertWithinPropertyQuota(supabase, "user-1", "free")).resolves.toBeUndefined();
  });

  it("blocks a second property once at the limit", async () => {
    const supabase = makeSupabaseMock({ count: 1, error: null }) as unknown as SupabaseClient;
    await expect(assertWithinPropertyQuota(supabase, "user-1", "free")).rejects.toBeInstanceOf(
      QuotaExceededError
    );
  });

  it("premium allows up to its higher property limit", async () => {
    const { maxProperties } = TIER_LIMITS.premium;
    const underLimit = makeSupabaseMock({
      count: maxProperties - 1,
      error: null,
    }) as unknown as SupabaseClient;
    await expect(
      assertWithinPropertyQuota(underLimit, "user-1", "premium")
    ).resolves.toBeUndefined();

    const atLimit = makeSupabaseMock({ count: maxProperties, error: null }) as unknown as SupabaseClient;
    await expect(assertWithinPropertyQuota(atLimit, "user-1", "premium")).rejects.toBeInstanceOf(
      QuotaExceededError
    );
  });
});

describe("report quota (free: 3 reports / 30 days)", () => {
  it("allows the 1st, 2nd, and 3rd report (2 existing reports so far)", async () => {
    const supabase = makeSupabaseMock({ count: 2, error: null }) as unknown as SupabaseClient;
    await expect(assertWithinReportQuota(supabase, "user-1", "free")).resolves.toBeUndefined();
  });

  it("blocks the 4th report once 3 already exist this month", async () => {
    const supabase = makeSupabaseMock({ count: 3, error: null }) as unknown as SupabaseClient;
    await expect(assertWithinReportQuota(supabase, "user-1", "free")).rejects.toBeInstanceOf(
      QuotaExceededError
    );
  });

  it("premium tier has a materially higher report ceiling than free", async () => {
    const { maxReportsPerMonth } = TIER_LIMITS.premium;
    expect(maxReportsPerMonth).toBeGreaterThan(TIER_LIMITS.free.maxReportsPerMonth);

    const underLimit = makeSupabaseMock({
      count: maxReportsPerMonth - 1,
      error: null,
    }) as unknown as SupabaseClient;
    await expect(assertWithinReportQuota(underLimit, "user-1", "premium")).resolves.toBeUndefined();

    const atLimit = makeSupabaseMock({
      count: maxReportsPerMonth,
      error: null,
    }) as unknown as SupabaseClient;
    await expect(assertWithinReportQuota(atLimit, "user-1", "premium")).rejects.toBeInstanceOf(
      QuotaExceededError
    );
  });
});

describe("getSubscriptionTier", () => {
  it("returns the stored tier when valid", async () => {
    const supabase = makeSupabaseMock({
      data: { subscription_tier: "premium" },
      error: null,
    }) as unknown as SupabaseClient;
    await expect(getSubscriptionTier(supabase, "user-1")).resolves.toBe("premium");
  });

  it("defaults to free when no profile row or an unrecognized tier is found", async () => {
    const missingProfile = makeSupabaseMock({ data: null, error: null }) as unknown as SupabaseClient;
    await expect(getSubscriptionTier(missingProfile, "user-1")).resolves.toBe("free");

    const badTier = makeSupabaseMock({
      data: { subscription_tier: "enterprise-typo" },
      error: null,
    }) as unknown as SupabaseClient;
    await expect(getSubscriptionTier(badTier, "user-1")).resolves.toBe("free");
  });
});
