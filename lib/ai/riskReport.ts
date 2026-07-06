import { z } from "zod";
import { ImageInput } from "@/lib/ai/client";
import { runAIJob } from "@/lib/ai/service";
import { ClimateSnapshot } from "@/lib/weather/openMeteo";
import { RiskReportPayload } from "@/lib/types";

const riskItemSchema = z.object({
  category: z.enum(["flood", "extreme_heat", "wildfire", "storm_wind", "drought", "sea_level", "other"]),
  level: z.enum(["low", "moderate", "high", "severe"]),
  summary: z.string(),
  confidence: z.enum(["low", "medium", "high"]),
});

const roadmapStepSchema = z.object({
  title: z.string(),
  priority: z.enum(["now", "this_year", "long_term"]),
  estimated_cost_usd: z.string(),
  description: z.string(),
});

const costRoiSchema = z.object({
  step_title: z.string(),
  upfront_cost_usd: z.string(),
  annual_savings_or_avoided_loss_usd: z.string(),
  payback_period: z.string(),
});

export const riskReportSchema = z.object({
  overall_risk_score: z.number().min(0).max(100),
  risks: z.array(riskItemSchema).min(1),
  adaptation_roadmap: z.array(roadmapStepSchema).min(1),
  cost_roi: z.array(costRoiSchema).min(1),
  insurance_notes: z.string(),
});

const SYSTEM_PROMPT = `You are a climate resilience analyst helping a homeowner understand their
property's exposure to climate-related hazards and plan practical adaptations. You are given
real geolocation, elevation, short-term forecast, and 5-year historical extreme-weather data for
the property, plus an optional photo. Ground your assessment in that data — do not invent
specific numeric claims it doesn't support, and say so when confidence is low.

Respond with ONLY a single JSON object (no markdown fences, no commentary) matching exactly this
shape:
{
  "overall_risk_score": number (0-100, higher = riskier),
  "risks": [ { "category": "flood"|"extreme_heat"|"wildfire"|"storm_wind"|"drought"|"sea_level"|"other",
               "level": "low"|"moderate"|"high"|"severe", "summary": string, "confidence": "low"|"medium"|"high" } ],
  "adaptation_roadmap": [ { "title": string, "priority": "now"|"this_year"|"long_term",
                             "estimated_cost_usd": string, "description": string } ],
  "cost_roi": [ { "step_title": string, "upfront_cost_usd": string,
                   "annual_savings_or_avoided_loss_usd": string, "payback_period": string } ],
  "insurance_notes": string
}

Include 3-5 risk categories, 4-6 roadmap steps ordered by priority, and cost/ROI entries that
correspond to the roadmap steps. Be specific and actionable, but always frame this as a planning
aid, not a substitute for a licensed inspector, engineer, or insurance agent.`;

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("AI response did not contain valid JSON.");
    return JSON.parse(match[0]);
  }
}

export async function generateRiskReport(params: {
  userId: string;
  label: string;
  address: string;
  lat: number;
  lon: number;
  climate: ClimateSnapshot;
  image?: ImageInput;
}): Promise<{ payload: RiskReportPayload; model: string }> {
  const { userId, label, address, lat, lon, climate, image } = params;

  const prompt = `Property: ${label}
Address: ${address}
Coordinates: ${lat.toFixed(4)}, ${lon.toFixed(4)}
Elevation: ${climate.elevationMeters ?? "unknown"} meters

14-day forecast max temps (C): ${climate.forecast.tempMaxC.join(", ")}
14-day forecast precipitation (mm/day): ${climate.forecast.precipitationMm.join(", ")}
14-day forecast wind gusts (km/h): ${climate.forecast.windGustsKmh.join(", ")}

Last 5 years of historical data at this location:
- Days with max temp >= 35C: ${climate.historicalExtremes.daysAbove35C}
- Days with max temp >= 38C: ${climate.historicalExtremes.daysAbove38C}
- Max single-day precipitation: ${climate.historicalExtremes.maxDailyPrecipitationMm.toFixed(1)} mm
- Days with heavy rain (>50mm): ${climate.historicalExtremes.daysWithHeavyRain}
- Max wind gust recorded: ${climate.historicalExtremes.maxWindGustKmh.toFixed(1)} km/h
${image ? "\nA photo of the property is attached. Factor in visible roof material/condition, vegetation proximity, drainage, and building materials where relevant." : ""}

Generate the JSON risk report now.`;

  const result = await runAIJob({
    feature: "climate_risk_report",
    userId,
    system: SYSTEM_PROMPT,
    prompt,
    image,
  });
  const parsed = extractJson(result.text);
  const payload = riskReportSchema.parse(parsed);

  return { payload, model: `${result.provider}:${result.model}` };
}
