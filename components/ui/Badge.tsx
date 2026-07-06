import { HTMLAttributes } from "react";
import clsx from "clsx";

type Tone = "low" | "moderate" | "high" | "severe" | "neutral";

const toneClasses: Record<Tone, string> = {
  low: "bg-risk-low/10 text-risk-low",
  moderate: "bg-risk-moderate/10 text-yellow-700",
  high: "bg-risk-high/10 text-risk-high",
  severe: "bg-risk-severe/10 text-risk-severe",
  neutral: "bg-neutral-100 text-neutral-700",
};

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
}

export function Badge({ className, tone = "neutral", ...props }: BadgeProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
        toneClasses[tone],
        className
      )}
      {...props}
    />
  );
}

export function riskTone(level: string): Tone {
  const normalized = level.toLowerCase();
  if (normalized === "low") return "low";
  if (normalized === "moderate") return "moderate";
  if (normalized === "high") return "high";
  if (normalized === "severe" || normalized === "extreme") return "severe";
  return "neutral";
}
