import { Card } from "@/components/ui/Card";
import { Badge, riskTone } from "@/components/ui/Badge";
import { Disclaimer } from "@/components/Disclaimer";
import { RiskReport } from "@/lib/types";

const PRIORITY_LABEL: Record<string, string> = {
  now: "Do now",
  this_year: "This year",
  long_term: "Long term",
};

function scoreTone(score: number): "low" | "moderate" | "high" | "severe" {
  if (score < 25) return "low";
  if (score < 50) return "moderate";
  if (score < 75) return "high";
  return "severe";
}

export function RiskReportView({ report }: { report: RiskReport }) {
  return (
    <div className="space-y-6">
      <Card className="flex items-center justify-between">
        <div>
          <p className="text-sm text-neutral-500">Overall risk score</p>
          <p className="text-3xl font-bold text-neutral-900">{report.overall_risk_score}/100</p>
        </div>
        <Badge tone={scoreTone(report.overall_risk_score)} className="text-sm">
          {scoreTone(report.overall_risk_score)}
        </Badge>
      </Card>

      <div>
        <h3 className="mb-3 text-lg font-semibold text-neutral-900">Risk breakdown</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {report.risks.map((risk, i) => (
            <Card key={i}>
              <div className="flex items-center justify-between">
                <span className="font-medium capitalize text-neutral-900">
                  {risk.category.replace("_", " ")}
                </span>
                <Badge tone={riskTone(risk.level)}>{risk.level}</Badge>
              </div>
              <p className="mt-2 text-sm text-neutral-600">{risk.summary}</p>
              <p className="mt-2 text-xs text-neutral-400">Confidence: {risk.confidence}</p>
            </Card>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-lg font-semibold text-neutral-900">Adaptation roadmap</h3>
        <div className="space-y-3">
          {report.adaptation_roadmap.map((step, i) => (
            <Card key={i}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-neutral-900">{step.title}</span>
                <div className="flex items-center gap-2">
                  <Badge tone="neutral">{PRIORITY_LABEL[step.priority] ?? step.priority}</Badge>
                  <span className="text-sm text-neutral-500">{step.estimated_cost_usd}</span>
                </div>
              </div>
              <p className="mt-2 text-sm text-neutral-600">{step.description}</p>
            </Card>
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-lg font-semibold text-neutral-900">Cost / ROI estimates</h3>
        <div className="overflow-x-auto rounded-2xl border border-neutral-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-50 text-neutral-500">
              <tr>
                <th className="px-4 py-2 font-medium">Step</th>
                <th className="px-4 py-2 font-medium">Upfront cost</th>
                <th className="px-4 py-2 font-medium">Annual savings / avoided loss</th>
                <th className="px-4 py-2 font-medium">Payback</th>
              </tr>
            </thead>
            <tbody>
              {report.cost_roi.map((row, i) => (
                <tr key={i} className="border-t border-neutral-100">
                  <td className="px-4 py-2 text-neutral-900">{row.step_title}</td>
                  <td className="px-4 py-2 text-neutral-600">{row.upfront_cost_usd}</td>
                  <td className="px-4 py-2 text-neutral-600">
                    {row.annual_savings_or_avoided_loss_usd}
                  </td>
                  <td className="px-4 py-2 text-neutral-600">{row.payback_period}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Card>
        <h3 className="mb-2 text-lg font-semibold text-neutral-900">Insurance notes</h3>
        <p className="text-sm text-neutral-600">{report.insurance_notes}</p>
      </Card>

      <Disclaimer />
    </div>
  );
}
