import { notFound } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { GenerateReportButton } from "@/components/GenerateReportButton";
import { RiskReportView } from "@/components/RiskReportView";
import { RiskReport } from "@/lib/types";

export default async function PropertyDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  const { data: property } = await supabase
    .from("properties")
    .select("*")
    .eq("id", params.id)
    .single();

  if (!property) notFound();

  const { data: reports } = await supabase
    .from("risk_reports")
    .select("*")
    .eq("property_id", params.id)
    .order("created_at", { ascending: false });

  const reportList = (reports ?? []) as RiskReport[];
  const latest = reportList[0];

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <Card className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {property.photo_url && (
            <Image
              src={property.photo_url}
              alt={property.label}
              width={64}
              height={64}
              className="rounded-xl object-cover"
            />
          )}
          <div>
            <h1 className="text-xl font-bold text-neutral-900">{property.label}</h1>
            <p className="text-sm text-neutral-600">{property.address}</p>
          </div>
        </div>
        <GenerateReportButton propertyId={property.id} />
      </Card>

      <div className="mt-8">
        {latest ? (
          <RiskReportView report={latest} />
        ) : (
          <Card className="text-center text-neutral-600">
            No risk report yet. Click &ldquo;Generate risk report&rdquo; to run your first AI
            climate risk audit for this property.
          </Card>
        )}
      </div>

      {reportList.length > 1 && (
        <div className="mt-10">
          <h3 className="mb-3 text-lg font-semibold text-neutral-900">Report history</h3>
          <ul className="space-y-2 text-sm text-neutral-600">
            {reportList.slice(1).map((r) => (
              <li key={r.id} className="flex justify-between rounded-xl border border-neutral-200 px-4 py-2">
                <span>{new Date(r.created_at).toLocaleString()}</span>
                <span>Score: {r.overall_risk_score}/100</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
