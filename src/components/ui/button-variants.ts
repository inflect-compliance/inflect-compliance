import { cva } from "class-variance-authority";

/**
 * R19-PR-B — the shared liquid-carbon surface recipe.
 * R19-PR-C — added the micro-grain layer + the carbon-on-hover
 *            recipe for the transparent-background variants.
 *
 * Extracted from R19-PR-A's inline `primary` block so every
 * carbon-treated variant references one recipe instead of
 * duplicating the classes. The recipe is variant-COLOUR-
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
 *   • a `::before` depth-overlay carrying TWO stacked images —
 *     `--btn-carbon-grain` (the micro-grain tile, top layer) over
 *     `--btn-carbon-overlay` (the soft elliptical light POOL that
 *     reads as liquid, bottom layer). Both sit in the ONE
 *     `::before` so they paint above the variant fill and below
 *     the label — grain over text would be wrong. `inset-0` +
 *     `rounded-[inherit]` tracks the button shape,
 *     `pointer-events-none` keeps it click-transparent.
 *
 * Spread into a variant's class array AFTER the variant's own
 * `bg-` / `hover:` classes.
 */
const carbonSurface = [
  "border-[var(--btn-carbon-border)]",
  "shadow-[var(--btn-carbon-bevel)]",
  "before:content-[''] before:absolute before:inset-0 before:rounded-[inherit] before:pointer-events-none",
  "before:bg-[image:var(--btn-carbon-grain),var(--btn-carbon-overlay)]",
];

/**
 * R19-PR-C — the carbon-on-hover recipe for the transparent
 * variants (`ghost`, `destructive-outline`).
 *
 * A depth-overlay over `bg-transparent` has no surface to pool
 * light on — at rest these variants stay flat and quiet, true
 * to their low-chrome intent. But the moment they gain a
 * `hover:bg-*` they DO have a surface, so the full carbon field
 * fades in: the same grain+pool `::before` (parked at
 * `opacity-0`, lifted to `opacity-100` on hover) carrying the
 * bevel shadow too. The border is deliberately NOT touched —
 * `ghost` stays borderless and `destructive-outline` keeps its
 * red danger edge; carbon emerges as DEPTH, not as a new outline.
 *
 * Why the bevel rides on `before:shadow-*` and NOT `hover:shadow-*`:
 * the `::before` is ALREADY opacity-gated on hover, so a shadow
 * declared on it inherits the hover gate for free — and the
 * v2-PR-4 motion-language ratchet bans `hover:shadow-*` outright
 * (hover-driven box-shadow reads as a decorative depth-lift). The
 * `--btn-carbon-bevel` is inset-led volume, not a lift; pinning
 * it to the `::before` keeps the whole carbon field on one gated
 * layer and stays inside the motion language.
 *
 * `before:transition-opacity` makes the carbon emerge as a
 * smooth fade rather than a snap; `motion-reduce` drops the
 * transition (the end state — carbon visible on hover — still
 * holds, it just arrives instantly).
 */
const carbonOnHover = [
  "before:content-[''] before:absolute before:inset-0 before:rounded-[inherit] before:pointer-events-none",
  "before:bg-[image:var(--btn-carbon-grain),var(--btn-carbon-overlay)]",
  "before:shadow-[var(--btn-carbon-bevel)]",
  "before:opacity-0 before:transition-opacity before:duration-150",
  "hover:before:opacity-100",
  "motion-reduce:before:transition-none",
];

/**
 * R19-PR-D — the carbon interaction-state recipe (the R19 capstone).
 *
 * PR-A/B/C built the carbon SURFACE — at rest and on hover. PR-D
 * makes the three INTERACTION states read as the same liquid-carbon
 * MATERIAL rather than generic CSS state changes, by driving them
 * all through ONE channel: the `::before` depth-overlay's opacity.
 *
 *   • pressed (`active:`) — the light pool DIMS
 *     (`active:before:opacity-70`). Pressing liquid carbon
 *     depresses the surface; less light gathers. Composes with
 *     the cva base's `active:scale-[0.97]` — shrink + dim reads
 *     as a real physical depression. Tailwind emits `active:`
 *     AFTER `hover:`, so on a hovered-then-pressed transparent
 *     variant the press-dim correctly wins over the hover-lift.
 *
 *   • focus (`focus-visible:`) — the carbon is REVEALED
 *     (`focus-visible:before:opacity-100`). `carbonOnHover` only
 *     lifts the `::before` on `hover:`; this gives keyboard users
 *     the same depth a mouse gets. A no-op for the solid recipes
 *     (their `::before` already rests at full opacity). The a11y
 *     focus ring in the cva base is deliberately untouched and
 *     stays the primary focus signal — carbon is depth, not a
 *     replacement for the ring.
 *
 *   • disabled — the carbon goes INERT (`disabled:before:opacity-0`).
 *     Not "dimmed liquid": the depth-overlay (pool + grain) drops
 *     out entirely so a disabled button reads as flat, dead
 *     material. The base `disabled:opacity-50` still mutes the
 *     fill + label.
 *
 * `before:transition-opacity` makes all three changes ride the
 * same smooth fade as the hover reveal — and gives the solid
 * recipe (`carbonSurface`, which had no `::before` transition of
 * its own) one too. `motion-reduce` drops the transition: the end
 * states still hold, they just arrive instantly.
 *
 * Spread into the cva BASE — every variant gets the same
 * interaction-state material, regardless of which surface recipe
 * (`carbonSurface` / `carbonOnHover`) it carries.
 */
const carbonStates = [
  "before:transition-opacity before:duration-150",
  "motion-reduce:before:transition-none",
  "active:before:opacity-70",
  "focus-visible:before:opacity-100",
  "disabled:before:opacity-0",
];

export const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-tight whitespace-nowrap",
    // R19-PR-C — density tuning. A whisper of negative tracking
    // (`-0.01em`) pulls the label into a denser, more deliberate
    // unit — the typographic half of "feels solid". Small enough
    // that no one clocks it as "tight type"; felt, not seen.
    "text-sm font-medium tracking-[-0.01em] transition-all duration-150",
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
    // button without a positioning surprise. Kept in the cva BASE
    // so a future variant inherits the positioning context for
    // free. Every variant now uses it — `carbonSurface` (solid
    // fills) or `carbonOnHover` (transparent fills).
    "relative",
    // R19-PR-D — carbon interaction states. The pressed / focus /
    // disabled states all ride the `::before` depth-overlay's
    // opacity, so they read as the liquid-carbon material
    // responding rather than as generic CSS state changes. In the
    // BASE so every variant gets the identical state material.
    ...carbonStates,
  ],
  {
    variants: {
      variant: {
        // R19-PR-A wired `primary`; R19-PR-B extracted the recipe
        // into `carbonSurface` and rolled it to `secondary` +
        // `destructive`; R19-PR-C rolled `carbonOnHover` to the
        // transparent variants. Every button now reads as liquid
        // carbon — solid fills always, transparent fills on hover.
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
          ...carbonOnHover,
        ],
        destructive: [
          "bg-bg-error-emphasis text-white",
          "hover:brightness-110",
          ...carbonSurface,
        ],
        "destructive-outline": [
          "bg-transparent border-border-error text-content-error",
          "hover:bg-bg-error hover:text-content-error",
          ...carbonOnHover,
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
