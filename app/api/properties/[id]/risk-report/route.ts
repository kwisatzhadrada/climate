import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getCachedClimateSnapshot } from "@/lib/weather/cache";
import { generateRiskReport } from "@/lib/ai/riskReport";
import type { ImageInput } from "@/lib/ai/client";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rateLimit";
import { assertWithinReportQuota, getSubscriptionTier, QuotaExceededError } from "@/lib/quota";
import { withIdempotency, IdempotencyInFlightError } from "@/lib/idempotency";
import type { RiskReport } from "@/lib/types";

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

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const rateLimit = await checkRateLimit(`risk-report:${user.id}`, RATE_LIMITS.riskReportGenerate);
  if (!rateLimit.success) {
    return NextResponse.json(
      { error: "Too many report requests. Please wait a minute and try again." },
      { status: 429 }
    );
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

  let tier;
  try {
    tier = await getSubscriptionTier(supabase, user.id);
    await assertWithinReportQuota(supabase, user.id, tier);
  } catch (err) {
    if (err instanceof QuotaExceededError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }

  const idempotencyKey = request.headers.get("Idempotency-Key");

  try {
    const { body, status } = await withIdempotency<{ report: RiskReport }>(
      supabase,
      { userId: user.id, endpoint: "risk-report", key: idempotencyKey },
      async () => {
        const serviceClient = createServiceClient();

        const [climate, image] = await Promise.all([
          getCachedClimateSnapshot(serviceClient, property.lat!, property.lon!),
          property.photo_url ? fetchImageAsBase64(property.photo_url) : Promise.resolve(undefined),
        ]);

        const { payload, model } = await generateRiskReport({
          userId: user.id,
          label: property.label,
          address: property.address,
          lat: property.lat!,
          lon: property.lon!,
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
          // Throw (rather than return an error body) so withIdempotency frees
          // the claim row instead of permanently caching a failed attempt
          // under this idempotency key.
          throw new Error(insertError.message);
        }

        return { body: { report }, status: 201 };
      }
    );

    return NextResponse.json(body, { status });
  } catch (err) {
    if (err instanceof IdempotencyInFlightError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Risk report generation failed" },
      { status: 502 }
    );
  }
}
