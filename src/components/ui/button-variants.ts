import { cva } from "class-variance-authority";

export const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-tight whitespace-nowrap",
    "text-sm font-medium transition-all duration-150",
    "border rounded-lg",
    "disabled:opacity-50 disabled:pointer-events-none",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
  ],
  {
    variants: {
      variant: {
        primary: [
          "bg-[var(--brand-emphasis)] border-[var(--brand-emphasis)] text-white",
          "hover:bg-[var(--brand-default)] hover:border-[var(--brand-default)]",
          "shadow-sm",
        ],
        secondary: [
          "bg-bg-default border-border-subtle text-content-emphasis",
          "hover:bg-bg-muted hover:border-border-default",
        ],
        ghost: [
          "bg-transparent border-transparent text-content-default",
          "hover:bg-bg-muted hover:text-content-emphasis",
        ],
        destructive: [
          "bg-bg-error-emphasis border-bg-error-emphasis text-white",
          "hover:brightness-110",
        ],
        "destructive-outline": [
          "bg-transparent border-border-error text-content-error",
          "hover:bg-bg-error hover:text-content-error",
        ],
      },
      size: {
        xs: "h-7 px-2.5 text-[11px] gap-1 rounded-md",
        sm: "h-8 px-3 text-xs gap-1.5",
        md: "h-9 px-3.5 text-sm gap-tight",
        lg: "h-10 px-5 text-sm gap-tight",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);
