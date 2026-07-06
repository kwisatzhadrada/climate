import type { SupabaseClient } from "@supabase/supabase-js";
import { getClimateSnapshot, type ClimateSnapshot } from "@/lib/weather/openMeteo";

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const BUCKET_PRECISION = 2; // ~1.1km at the equator — plenty for property-level risk framing

function toBucket(value: number): number {
  return Math.round(value * 10 ** BUCKET_PRECISION) / 10 ** BUCKET_PRECISION;
}

/**
 * Wraps getClimateSnapshot with a Postgres-backed cache keyed on a rounded
 * lat/lon bucket, so regenerating a report for the same property (or a
 * nearby one) doesn't re-hit Open-Meteo every time. `serviceClient` must be
 * the service-role client — climate_cache has no user-facing RLS policy.
 */
export async function getCachedClimateSnapshot(
  serviceClient: SupabaseClient,
  lat: number,
  lon: number
): Promise<ClimateSnapshot> {
  const latBucket = toBucket(lat);
  const lonBucket = toBucket(lon);

  const { data: cached } = await serviceClient
    .from("climate_cache")
    .select("payload, fetched_at")
    .eq("lat_bucket", latBucket)
    .eq("lon_bucket", lonBucket)
    .maybeSingle();

  if (cached && Date.now() - new Date(cached.fetched_at).getTime() < CACHE_TTL_MS) {
    return cached.payload as ClimateSnapshot;
  }

  const snapshot = await getClimateSnapshot(lat, lon);

  // Best-effort cache write, awaited (not fire-and-forget) since serverless
  // functions can be frozen before a detached promise resolves — but a
  // failure here still shouldn't fail report generation.
  try {
    await serviceClient.from("climate_cache").upsert(
      {
        lat_bucket: latBucket,
        lon_bucket: lonBucket,
        payload: snapshot,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: "lat_bucket,lon_bucket" }
    );
  } catch {
    // Non-fatal: worst case we just re-fetch from Open-Meteo next time.
  }

  return snapshot;
}
