import { InputHTMLAttributes, forwardRef } from "react";
import clsx from "clsx";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={clsx(
        "w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm text-neutral-900",
        "focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100",
        className
      )}
      {...props}
    />
  )
);

Input.displayName = "Input";
