import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getClimateSnapshot } from "@/lib/weather/openMeteo";
import { generateRiskReport } from "@/lib/ai/riskReport";
import type { ImageInput } from "@/lib/ai/client";

async function fetchImageAsBase64(url: string): Promise<ImageInput | undefined> {
  try {
    const res = await fetch(url);
    if (!res.ok) return undefined;

    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    const mediaType = contentType.includes("png")
      ? "image/png"
      : contentType.includes("webp")
        ? "image/webp"
        : "image/jpeg";

    const buffer = Buffer.from(await res.arrayBuffer());
    // Keep vision payloads reasonably sized; skip oversized images rather than fail the request.
    if (buffer.byteLength > 5 * 1024 * 1024) return undefined;

    return { base64: buffer.toString("base64"), mediaType };
  } catch {
    return undefined;
  }
}

export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: property, error: propertyError } = await supabase
    .from("properties")
    .select("*")
    .eq("id", params.id)
    .single();

  if (propertyError || !property) {
    return NextResponse.json({ error: "Property not found" }, { status: 404 });
  }

  if (property.lat === null || property.lon === null) {
    return NextResponse.json(
      { error: "Property is missing coordinates; re-add it with a valid address." },
      { status: 422 }
    );
  }

  try {
    const [climate, image] = await Promise.all([
      getClimateSnapshot(property.lat, property.lon),
      property.photo_url ? fetchImageAsBase64(property.photo_url) : Promise.resolve(undefined),
    ]);

    const { payload, model } = await generateRiskReport({
      label: property.label,
      address: property.address,
      lat: property.lat,
      lon: property.lon,
      climate,
      image,
    });

    const { data: report, error: insertError } = await supabase
      .from("risk_reports")
      .insert({
        property_id: property.id,
        user_id: user.id,
        overall_risk_score: payload.overall_risk_score,
        risks: payload.risks,
        adaptation_roadmap: payload.adaptation_roadmap,
        cost_roi: payload.cost_roi,
        insurance_notes: payload.insurance_notes,
        weather_snapshot: climate as unknown as Record<string, unknown>,
        model,
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ report }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Risk report generation failed" },
      { status: 502 }
    );
  }
}
