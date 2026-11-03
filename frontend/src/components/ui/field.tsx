import * as React from "react";

import { cn } from "../../lib/utils";

interface FieldProps {
  label: string;
  htmlFor: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}

/** Rótulo + campo + dica, no espaçamento padrão dos formulários. */
export function Field({ label, htmlFor, hint, className, children }: FieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-[13px] font-bold text-(--text-main)">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs font-medium text-(--text-muted)">{hint}</p>}
    </div>
  );
}

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, rows = 4, ...props }, ref) => (
  <textarea
    ref={ref}
    rows={rows}
    className={cn(
      "g360-ui-input w-full rounded-xl border px-3 py-2.5 text-sm leading-relaxed outline-none transition disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  />
));

Textarea.displayName = "Textarea";

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      "g360-ui-input h-10 w-full cursor-pointer rounded-xl border px-3 text-sm outline-none transition disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  >
    {children}
  </select>
));

Select.displayName = "Select";
