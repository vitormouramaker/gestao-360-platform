import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "g360-ui-button inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl text-sm font-bold transition disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-(--primary) text-white hover:bg-(--primary-hover) active:scale-[0.98]",
        secondary:
          "bg-(--bg-elevated) text-(--text-main) ring-1 ring-(--border-strong) hover:bg-(--bg-surface-muted)",
        ghost: "text-(--text-muted) hover:bg-(--bg-surface-muted) hover:text-(--text-main)",
        soft: "bg-(--primary)/12 text-(--primary-text) hover:bg-(--primary)/18",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-10 px-4",
        lg: "h-12 px-6",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  ),
);

Button.displayName = "Button";
