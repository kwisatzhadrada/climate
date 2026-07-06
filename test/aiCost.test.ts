import { describe, expect, it } from "vitest";
import { estimateCostUsd } from "@/lib/ai/service";

describe("estimateCostUsd", () => {
  it("computes cost from input/output tokens for a known model", () => {
    const cost = estimateCostUsd("claude-sonnet-4-5", { inputTokens: 2000, outputTokens: 1000 });
    // (2000/1000)*0.003 + (1000/1000)*0.015 = 0.006 + 0.015
    expect(cost).toBeCloseTo(0.021, 5);
  });

  it("matches on a model string prefix (e.g. provider-qualified names)", () => {
    const cost = estimateCostUsd("anthropic:claude-sonnet-4-5-20250101", {
      inputTokens: 1000,
      outputTokens: 1000,
    });
    expect(cost).toBeCloseTo(0.018, 5);
  });

  it("returns null for an unrecognized model rather than guessing", () => {
    expect(estimateCostUsd("some-future-model-v9", { inputTokens: 1000, outputTokens: 1000 })).toBeNull();
  });

  it("returns null when usage is unavailable", () => {
    expect(estimateCostUsd("gpt-4o", null)).toBeNull();
  });
});
