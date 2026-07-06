import type { SupabaseClient } from "@supabase/supabase-js";

const POSTGRES_UNIQUE_VIOLATION = "23505";

export class IdempotencyInFlightError extends Error {
  constructor() {
    super("A request with this Idempotency-Key is already in progress. Retry shortly.");
    this.name = "IdempotencyInFlightError";
  }
}

interface HandlerResult<T> {
  body: T;
  status: number;
}

/**
 * Wraps an expensive, side-effecting handler (an AI report generation call)
 * with request-level idempotency: if the client supplies the same
 * `Idempotency-Key` header again (double-click, retry after a dropped
 * response, etc.), the original result is replayed instead of doing — and
 * billing for — the work a second time.
 *
 * Uses a claim-row insert (primary key on user_id+endpoint+key) so two
 * genuinely concurrent requests with the same key can't both slip past a
 * plain read-then-write check.
 */
export async function withIdempotency<T>(
  supabase: SupabaseClient,
  params: { userId: string; endpoint: string; key: string | null },
  handler: () => Promise<HandlerResult<T>>
): Promise<HandlerResult<T> & { replayed: boolean }> {
  if (!params.key) {
    const result = await handler();
    return { ...result, replayed: false };
  }

  const { userId, endpoint, key } = params;

  const { error: claimError } = await supabase
    .from("idempotency_keys")
    .insert({ user_id: userId, endpoint, key });

  if (claimError) {
    if (claimError.code !== POSTGRES_UNIQUE_VIOLATION) throw claimError;

    // Someone already claimed this key — either it finished (return the
    // stored response) or it's still running (tell the caller to retry).
    const { data: existing } = await supabase
      .from("idempotency_keys")
      .select("response, status_code")
      .eq("user_id", userId)
      .eq("endpoint", endpoint)
      .eq("key", key)
      .maybeSingle();

    if (existing?.response !== null && existing?.response !== undefined) {
      return { body: existing.response as T, status: existing.status_code ?? 200, replayed: true };
    }

    throw new IdempotencyInFlightError();
  }

  let result: HandlerResult<T>;
  try {
    result = await handler();
  } catch (err) {
    // Free the claim so a retry after a genuine failure isn't stuck forever.
    await supabase
      .from("idempotency_keys")
      .delete()
      .eq("user_id", userId)
      .eq("endpoint", endpoint)
      .eq("key", key);
    throw err;
  }

  await supabase
    .from("idempotency_keys")
    .update({ response: result.body as object, status_code: result.status })
    .eq("user_id", userId)
    .eq("endpoint", endpoint)
    .eq("key", key);

  return { ...result, replayed: false };
}
