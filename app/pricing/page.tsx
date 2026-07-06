"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

const TIERS = [
  {
    name: "Free",
    price: "$0",
    tier: null,
    features: [
      "1 property",
      "1 risk report per month",
      "Basic adaptation roadmap",
      "Community resources",
    ],
  },
  {
    name: "Premium",
    price: "$19/mo",
    tier: "premium",
    features: [
      "Up to 5 properties",
      "Unlimited risk reports",
      "Cost/ROI + insurance optimization",
      "Severe-weather alerts",
      "Priority AI model",
    ],
    highlighted: true,
  },
  {
    name: "Business",
    price: "$99/mo",
    tier: "business",
    features: [
      "Unlimited properties",
      "Team seats",
      "Community/portfolio resilience dashboard",
      "API access",
      "Dedicated support",
    ],
  },
];

export default function PricingPage() {
  const [loadingTier, setLoadingTier] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleUpgrade(tier: string) {
    setLoadingTier(tier);
    setError(null);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Checkout is not available yet");
      window.location.href = json.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoadingTier(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-16">
      <h1 className="text-center text-3xl font-bold text-neutral-900">Simple, honest pricing</h1>
      <p className="mx-auto mt-3 max-w-xl text-center text-neutral-600">
        Start free. Upgrade when you need deeper forecasts, more properties, or team/community
        tools.
      </p>

      <div className="mt-10 grid gap-6 sm:grid-cols-3">
        {TIERS.map((t) => (
          <Card key={t.name} className={t.highlighted ? "border-brand-500 ring-1 ring-brand-500" : ""}>
            <h2 className="text-lg font-semibold text-neutral-900">{t.name}</h2>
            <p className="mt-1 text-2xl font-bold text-neutral-900">{t.price}</p>
            <ul className="mt-4 space-y-2 text-sm text-neutral-600">
              {t.features.map((f) => (
                <li key={f} className="flex gap-2">
                  <span className="text-brand-600">✓</span>
                  {f}
                </li>
              ))}
            </ul>
            {t.tier && (
              <Button
                className="mt-6 w-full"
                variant={t.highlighted ? "primary" : "secondary"}
                loading={loadingTier === t.tier}
                onClick={() => handleUpgrade(t.tier!)}
              >
                Upgrade to {t.name}
              </Button>
            )}
          </Card>
        ))}
      </div>
      {error && <p className="mt-4 text-center text-sm text-red-600">{error}</p>}
    </div>
  );
}
