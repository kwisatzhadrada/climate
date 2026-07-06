"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

export function GenerateReportButton({ propertyId }: { propertyId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/properties/${propertyId}/risk-report`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to generate report");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <Button onClick={handleClick} loading={loading}>
        {loading ? "Analyzing climate risk..." : "Generate risk report"}
      </Button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
