import { cva } from "class-variance-authority";

export const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-tight whitespace-nowrap",
    "text-sm font-medium transition-all duration-150",
    "border rounded-lg",
    "disabled:opacity-50 disabled:pointer-events-none",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    // R11-PR4 — microinteraction sweep. Every button gets a subtle
    // press-down scale on `:active` so clicks feel responsive. The
    // 3% shrink is intentionally small — large enough to register
    // tactile feedback, small enough to never read as a glitch.
    // `motion-reduce` removes the scale entirely for users who opt
    // out of motion.
    "active:scale-[0.97] motion-reduce:active:scale-100",
    // R19-PR-A — liquid-carbon surface scaffolding. `relative`
    // lets each variant hang a `::before` depth-overlay off the
    // button without a positioning surprise. Variant-agnostic +
    // a no-op for variants that don't (yet) paint a `before:bg-`
    // — the overlay classes themselves live per-variant (PR-A
    // wires `primary`; PR-B rolls the rest). Kept in the cva
    // BASE so a future variant inherits the positioning context
    // for free.
    "relative",
  ],
  {
    variants: {
      variant: {
        primary: [
          "bg-[var(--brand-emphasis)] text-white",
          "hover:bg-[var(--brand-default)]",
          // R19-PR-A — liquid-carbon surface treatment. The
          // button stops reading as a flat painted rectangle and
          // becomes a deep, voluminous pool of liquid carbon:
          //   • `--btn-carbon-border` — the meniscus edge: a
          //     hair darker than the surface so the silhouette
          //     is crisp, never a "drawn outline";
          //   • `--btn-carbon-bevel` box-shadow — a SOFT inset
          //     top highlight + a faint inset bottom bounce-glow
          //     + a tight outer drop. This is what gives the
          //     surface VOLUME, the read of depth under a wet
          //     skin;
          //   • a `::before` depth-overlay carrying the
          //     `--btn-carbon-overlay` field — a soft elliptical
          //     light POOL near the top-centre fading to a dark
          //     pool at the base. The radial pool (not a flat
          //     ramp) is what reads as LIQUID: light gathers on
          //     a curved wet surface. The pseudo is `inset-0` +
          //     `rounded-[inherit]` so it tracks the button's
          //     shape, `pointer-events-none` so it never
          //     intercepts a click, and — paint-order-wise — it
          //     sits ABOVE the brand fill but BELOW the label
          //     (a `::before` paints after the background and
          //     before in-flow children, no z-index needed).
          "border-[var(--btn-carbon-border)]",
          "shadow-[var(--btn-carbon-bevel)]",
          "before:content-[''] before:absolute before:inset-0 before:rounded-[inherit] before:pointer-events-none",
          "before:bg-[image:var(--btn-carbon-overlay)]",
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
