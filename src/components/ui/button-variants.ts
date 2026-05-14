import { cva } from "class-variance-authority";

/**
 * R19-PR-B — the shared liquid-carbon surface recipe.
 *
 * Extracted from R19-PR-A's inline `primary` block so every
 * carbon-treated variant references one recipe instead of
 * duplicating the four classes. The recipe is variant-COLOUR-
 * agnostic — every piece composes over whatever `bg-` the
 * variant paints:
 *
 *   • `--btn-carbon-border` — the meniscus edge, a token tone a
 *     hair darker than the surface so the silhouette is crisp
 *     without a "drawn outline";
 *   • `--btn-carbon-bevel` — the box-shadow that gives the
 *     surface VOLUME: a SOFT inset top-edge highlight (this is
 *     the "edge-light" — the bevel catches a hair of light) +
 *     a faint inset bottom bounce-glow + a tight outer drop;
 *   • a `::before` depth-overlay carrying `--btn-carbon-overlay`
 *     — the soft elliptical light POOL that reads as liquid.
 *     `inset-0` + `rounded-[inherit]` tracks the button shape,
 *     `pointer-events-none` keeps it click-transparent. Paint
 *     order puts it above the variant fill, below the label.
 *
 * Spread into a variant's class array AFTER the variant's own
 * `bg-` / `hover:` classes. Transparent-background variants
 * (`ghost`, `destructive-outline`) deliberately DON'T take this
 * recipe yet — a depth-overlay over `bg-transparent` has no
 * surface to pool light on. R19-PR-C handles those with a
 * carbon-on-hover treatment.
 */
const carbonSurface = [
  "border-[var(--btn-carbon-border)]",
  "shadow-[var(--btn-carbon-bevel)]",
  "before:content-[''] before:absolute before:inset-0 before:rounded-[inherit] before:pointer-events-none",
  "before:bg-[image:var(--btn-carbon-overlay)]",
];

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
    // a no-op for variants that don't paint a `before:bg-`
    // (`ghost`, `destructive-outline`). Kept in the cva BASE so a
    // future variant inherits the positioning context for free.
    "relative",
  ],
  {
    variants: {
      variant: {
        // R19-PR-A wired `primary`; R19-PR-B extracted the recipe
        // into `carbonSurface` and rolled it to `secondary` +
        // `destructive`. All three now read as deep, voluminous
        // pools of liquid carbon — only the variant's `bg-` hue
        // differs underneath the shared depth field.
        primary: [
          "bg-[var(--brand-emphasis)] text-white",
          "hover:bg-[var(--brand-default)]",
          ...carbonSurface,
        ],
        secondary: [
          "bg-bg-default text-content-emphasis",
          "hover:bg-bg-muted",
          ...carbonSurface,
        ],
        ghost: [
          "bg-transparent border-transparent text-content-default",
          "hover:bg-bg-muted hover:text-content-emphasis",
        ],
        destructive: [
          "bg-bg-error-emphasis text-white",
          "hover:brightness-110",
          ...carbonSurface,
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
