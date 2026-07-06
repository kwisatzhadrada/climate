/**
 * A tiny in-memory stand-in for the `idempotency_keys` table, faithful
 * enough to lib/idempotency.ts's actual query shapes (a plain `.insert()`
 * with no filter, then `.select()/.update()/.delete()` filtered by three
 * `.eq()` calls) to exercise real dedupe/claim-row behavior in tests.
 */
interface Row {
  response: unknown;
  status_code: number | null;
}

export class FakeIdempotencyStore {
  private rows = new Map<string, Row>();

  private keyFor(userId: string, endpoint: string, key: string): string {
    return `${userId}:${endpoint}:${key}`;
  }

  /** Simulates another request having claimed this key but not finished yet. */
  seedInFlightClaim(userId: string, endpoint: string, key: string): void {
    this.rows.set(this.keyFor(userId, endpoint, key), { response: null, status_code: null });
  }

  makeClient() {
    const store = this;

    return {
      from(table: string) {
        if (table !== "idempotency_keys") {
          throw new Error(`FakeIdempotencyStore only supports idempotency_keys, got "${table}"`);
        }

        let mode: "insert" | "select" | "update" | "delete" = "select";
        let insertPayload: { user_id: string; endpoint: string; key: string } | null = null;
        let updatePayload: Partial<Row> | null = null;
        const filters: Record<string, string> = {};

        const builder: Record<string, unknown> = {
          insert(payload: { user_id: string; endpoint: string; key: string }) {
            mode = "insert";
            insertPayload = payload;
            return builder;
          },
          select() {
            return builder;
          },
          update(payload: Partial<Row>) {
            mode = "update";
            updatePayload = payload;
            return builder;
          },
          delete() {
            mode = "delete";
            return builder;
          },
          eq(column: string, value: string) {
            filters[column] = value;
            return builder;
          },
          maybeSingle() {
            return builder;
          },
          then(resolve: (result: { data: unknown; error: unknown }) => void) {
            if (mode === "insert" && insertPayload) {
              const k = store.keyFor(insertPayload.user_id, insertPayload.endpoint, insertPayload.key);
              if (store.rows.has(k)) {
                resolve({
                  data: null,
                  error: { code: "23505", message: "duplicate key value violates unique constraint" },
                });
              } else {
                store.rows.set(k, { response: null, status_code: null });
                resolve({ data: null, error: null });
              }
              return;
            }

            const k = store.keyFor(filters.user_id, filters.endpoint, filters.key);

            if (mode === "select") {
              resolve({ data: store.rows.get(k) ?? null, error: null });
            } else if (mode === "update") {
              const row = store.rows.get(k);
              if (row && updatePayload) Object.assign(row, updatePayload);
              resolve({ data: null, error: null });
            } else if (mode === "delete") {
              store.rows.delete(k);
              resolve({ data: null, error: null });
            } else {
              resolve({ data: null, error: null });
            }
          },
        };

        return builder;
      },
    };
  }
}
