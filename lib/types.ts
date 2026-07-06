export interface RiskItem {
  category: "flood" | "extreme_heat" | "wildfire" | "storm_wind" | "drought" | "sea_level" | "other";
  level: "low" | "moderate" | "high" | "severe";
  summary: string;
  confidence: "low" | "medium" | "high";
}

export interface RoadmapStep {
  title: string;
  priority: "now" | "this_year" | "long_term";
  estimated_cost_usd: string;
  description: string;
}

export interface CostRoi {
  step_title: string;
  upfront_cost_usd: string;
  annual_savings_or_avoided_loss_usd: string;
  payback_period: string;
}

export interface RiskReportPayload {
  overall_risk_score: number;
  risks: RiskItem[];
  adaptation_roadmap: RoadmapStep[];
  cost_roi: CostRoi[];
  insurance_notes: string;
}

export interface Property {
  id: string;
  user_id: string;
  label: string;
  address: string;
  lat: number | null;
  lon: number | null;
  photo_url: string | null;
  created_at: string;
}

export interface RiskReport {
  id: string;
  property_id: string;
  user_id: string;
  overall_risk_score: number;
  risks: RiskItem[];
  adaptation_roadmap: RoadmapStep[];
  cost_roi: CostRoi[];
  insurance_notes: string;
  weather_snapshot: Record<string, unknown> | null;
  model: string | null;
  created_at: string;
}
