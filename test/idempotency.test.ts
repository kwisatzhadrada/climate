import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { withIdempotency, IdempotencyInFlightError } from "@/lib/idempotency";
import { FakeIdempotencyStore } from "./fakeIdempotencyStore";

describe("withIdempotency", () => {
  it("sending the same Idempotency-Key twice only runs the handler (AI call) once", async () => {
    const supabase = new FakeIdempotencyStore().makeClient() as unknown as SupabaseClient;
    const handler = vi.fn(async () => ({ body: { report: { id: "r1" } }, status: 201 }));

    const first = await withIdempotency(
      supabase,
      { userId: "u1", endpoint: "risk-report", key: "same-key" },
      handler
    );
    const second = await withIdempotency(
      supabase,
      { userId: "u1", endpoint: "risk-report", key: "same-key" },
      handler
    );

    expect(handler).toHaveBeenCalledTimes(1);
    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.body).toEqual(first.body);
  });

  it("a different key (or no key) does not dedupe — each is a distinct request", async () => {
    const supabase = new FakeIdempotencyStore().makeClient() as unknown as SupabaseClient;
    const handler = vi.fn(async () => ({ body: { ok: true }, status: 200 }));

    await withIdempotency(supabase, { userId: "u1", endpoint: "risk-report", key: null }, handler);
    await withIdempotency(supabase, { userId: "u1", endpoint: "risk-report", key: null }, handler);
    await withIdempotency(supabase, { userId: "u1", endpoint: "risk-report", key: "key-a" }, handler);
    await withIdempotency(supabase, { userId: "u1", endpoint: "risk-report", key: "key-b" }, handler);

    expect(handler).toHaveBeenCalledTimes(4);
  });

  it("frees the claim on handler failure so a later retry with the same key can succeed", async () => {
    const supabase = new FakeIdempotencyStore().makeClient() as unknown as SupabaseClient;
    const failingHandler = vi.fn(async (): Promise<{ body: unknown; status: number }> => {
      throw new Error("AI provider timed out");
    });

    await expect(
      withIdempotency(supabase, { userId: "u1", endpoint: "risk-report", key: "retry-me" }, failingHandler)
    ).rejects.toThrow("AI provider timed out");

    const okHandler = vi.fn(async () => ({ body: { ok: true }, status: 200 }));
    const result = await withIdempotency(
      supabase,
      { userId: "u1", endpoint: "risk-report", key: "retry-me" },
      okHandler
    );

    expect(okHandler).toHaveBeenCalledTimes(1);
    expect(result.replayed).toBe(false);
  });

  it("rejects a genuinely concurrent duplicate (claimed but not yet finished) instead of double-running", async () => {
    const store = new FakeIdempotencyStore();
    store.seedInFlightClaim("u1", "risk-report", "concurrent");
    const supabase = store.makeClient() as unknown as SupabaseClient;
    const handler = vi.fn(async () => ({ body: { ok: true }, status: 200 }));

    await expect(
      withIdempotency(supabase, { userId: "u1", endpoint: "risk-report", key: "concurrent" }, handler)
    ).rejects.toBeInstanceOf(IdempotencyInFlightError);
    expect(handler).not.toHaveBeenCalled();
  });
});
