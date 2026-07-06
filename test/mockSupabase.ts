/**
 * Minimal chainable stand-in for a Supabase query builder. Real
 * @supabase/supabase-js builders are "thenable" — the object returned by the
 * last chained call (`.eq(...)`, `.single()`, etc.) can itself be awaited —
 * so this mock just returns itself from every chain method and resolves to
 * a fixed result when awaited.
 */
export function makeQueryResult<T>(result: T) {
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    gte: () => builder,
    single: () => builder,
    maybeSingle: () => builder,
    order: () => builder,
    insert: () => builder,
    update: () => builder,
    delete: () => builder,
    upsert: () => builder,
    then: (resolve: (value: T) => void) => resolve(result),
  };
  return builder;
}

/** Builds a fake Supabase client whose `.from(table)` returns a canned result
 * regardless of which table/chain is requested — enough for testing code
 * that only reads one query's result per call, like lib/quota.ts. */
export function makeSupabaseMock<T>(result: T) {
  return {
    from: () => makeQueryResult(result),
  };
}
