import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Disclaimer } from "@/components/Disclaimer";

const FEATURES = [
  {
    icon: "🏠",
    title: "Climate Resilience Auditor",
    description:
      "Enter your address and get an AI-generated risk report covering flood, heat, storm, and wildfire exposure — plus a prioritized adaptation roadmap with cost/ROI estimates and insurance guidance.",
  },
  {
    icon: "🌱",
    title: "Precision Food & Water Optimizer",
    description:
      "Personalized gardening, irrigation, and soil plans tuned to your microclimate, with shortage forecasting and recipes built around what's locally available. (Coming soon)",
  },
  {
    icon: "🛡️",
    title: "Pandemic & Biosecurity Shield",
    description:
      "A privacy-first, on-device-friendly dashboard for early warning signals, symptom triage, and household preparedness checklists. (Coming soon)",
  },
];

export default function HomePage() {
  return (
    <div>
      <section className="mx-auto max-w-6xl px-6 py-20 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-neutral-900 sm:text-5xl">
          Proactive resilience for your home,
          <br className="hidden sm:block" /> family, and community.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-neutral-600">
          AI-powered tools for adapting to climate extremes, food and water disruption, and
          public-health risk — the hyper-local, personal-scale planning that big tech and
          government don&apos;t deliver.
        </p>
        <div className="mt-8 flex justify-center gap-4">
          <Link
            href="/signup"
            className="rounded-xl bg-brand-600 px-6 py-3 font-medium text-white hover:bg-brand-700"
          >
            Get your free risk report
          </Link>
          <Link
            href="/pricing"
            className="rounded-xl border border-neutral-300 px-6 py-3 font-medium text-neutral-900 hover:bg-neutral-50"
          >
            See pricing
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-20">
        <div className="grid gap-6 sm:grid-cols-3">
          {FEATURES.map((feature) => (
            <Card key={feature.title}>
              <div className="text-3xl">{feature.icon}</div>
              <h3 className="mt-4 text-lg font-semibold text-neutral-900">{feature.title}</h3>
              <p className="mt-2 text-sm text-neutral-600">{feature.description}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="border-t border-neutral-200 bg-white py-10">
        <div className="mx-auto max-w-3xl px-6">
          <Disclaimer />
        </div>
      </section>
    </div>
  );
}
