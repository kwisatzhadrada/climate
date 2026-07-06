import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { geocodeAddress } from "@/lib/weather/geocode";

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json();
  const { label, address, photo_url } = body ?? {};

  if (!label || typeof label !== "string" || !address || typeof address !== "string") {
    return NextResponse.json({ error: "label and address are required" }, { status: 400 });
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
