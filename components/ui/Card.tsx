import { HTMLAttributes } from "react";
import clsx from "clsx";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx(
        "rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm",
        className
      )}
      {...props}
    />
  );
}
