import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { geocodeAddress } from "@/lib/weather/geocode";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rateLimit";
import { assertWithinPropertyQuota, getSubscriptionTier, QuotaExceededError } from "@/lib/quota";

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const rateLimitError = await enforceRateLimit(`property-create:${user.id}`, RATE_LIMITS.propertyCreate);
  if (rateLimitError) {
    return NextResponse.json({ error: rateLimitError.error }, { status: rateLimitError.status });
  }

  const body = await request.json();
  const { label, address, photo_url } = body ?? {};

  if (!label || typeof label !== "string" || !address || typeof address !== "string") {
    return NextResponse.json({ error: "label and address are required" }, { status: 400 });
  }

  try {
    const tier = await getSubscriptionTier(supabase, user.id);
    await assertWithinPropertyQuota(supabase, user.id, tier);
  } catch (err) {
    if (err instanceof QuotaExceededError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }

  let geocoded;
  try {
    geocoded = await geocodeAddress(address);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Geocoding failed" },
      { status: 422 }
    );
  }

  const { data, error } = await supabase
    .from("properties")
    .insert({
      user_id: user.id,
      label,
      address: geocoded.displayName,
      lat: geocoded.lat,
      lon: geocoded.lon,
      photo_url: photo_url ?? null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ property: data }, { status: 201 });
}
