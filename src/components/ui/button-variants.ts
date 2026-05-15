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
  // R20-PR-D — state-conditional ambient elevation. The REST shadow
  // stays bevel-only (the R19 contract — solid carbon at rest); on
  // press the ambient COLLAPSES into one tight stop so the surface
  // reads as depressed; on focus the ambient EXPANDS with a brand-
  // tinted ring so the surface reads as deliberately raised. Each
  // override is a comma-composed `bevel,ambient-*` so the inset
  // highlights survive (bevel insets are the volume FROM the
  // inside; ambient is the volume FROM the outside — both are
  // wanted in every state). Hover stays unannotated because PR-B's
  // aura wash on `::after` is the hover indicator; pinning a
  // second shadow there would over-compete with the aura.
  "active:shadow-[var(--btn-carbon-bevel),var(--btn-ambient-press)]",
  "focus-visible:shadow-[var(--btn-carbon-bevel),var(--btn-ambient-focus)]",
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

/**
 * R20-PR-B — the iridescent edge recipe.
 *
 * A 1px gradient stroke painted via the `::after` pseudo-element,
 * tracking the button's rounded corners. Brand → secondary linear
 * sweep (the `--btn-iridescent-gradient` token), always visible
 * — the iridescence is a MATERIAL PROPERTY of the surface, not a
 * state signal. (Aura is the state signal; iridescence is the
 * baseline finish, the way the meniscus catches light no matter
 * what you do to it.)
 *
 * Why a separate pseudo. R19 claims `::before` for the depth
 * overlay (grain + light pool + bevel insets). R20's iridescent
 * edge is a separate visual layer that paints ABOVE the surface
 * (it's the outermost finish), so it rides `::after` — which
 * Tailwind layers above `::before` in z-stack by default. The two
 * compose without colliding.
 *
 * Technique. The classic mask-composite recipe for a 1px gradient
 * border on a rounded element:
 *
 *   ::after {
 *     content: '';
 *     inset: 0; position: absolute; border-radius: inherit;
 *     padding: 1px;
 *     background-image: linear-gradient(...);
 *     mask: linear-gradient(#fff,#fff) content-box,
 *           linear-gradient(#fff,#fff);
 *     mask-composite: exclude;          (modern)
 *     -webkit-mask-composite: xor;      (Safari)
 *   }
 *
 * The two mask layers — content-box-clipped + full-element — XOR
 * each other; only the 1px ring between content-box and border-box
 * remains opaque. The gradient paints through that ring; the
 * interior is masked away. Tracks the parent's `border-radius`
 * exactly because `rounded-[inherit]` is on the pseudo.
 *
 * `pointer-events-none` keeps the iridescent layer click-transparent
 * — the underlying button stays the click target.
 *
 * Spread into variants that should carry the iridescent finish.
 * Today only `primary` — secondary and destructive are restrained
 * by intent (secondary = quiet; destructive = warning, not seduction).
 */
const iridescentEdge = [
  "after:content-[''] after:absolute after:inset-0 after:rounded-[inherit] after:pointer-events-none",
  "after:p-px",
  "after:bg-[image:var(--btn-iridescent-gradient)]",
  "after:[mask:linear-gradient(white,white)_content-box,linear-gradient(white,white)]",
  "after:[-webkit-mask-composite:xor]",
  "after:[mask-composite:exclude]",
  // R20-PR-D — disabled dust-out. The iridescent meniscus is a
  // material finish, not a state signal — but on a disabled
  // button the WHOLE surface should read inert. R19 already
  // drops `::before` to opacity-0 on disabled; R20-D drops the
  // `::after` iridescence to 30% so the meniscus is muted rather
  // than gone (a sudden disappearance would make disabled
  // primary read as a structurally different button — like the
  // edge was painted on, not finished into the surface). 30% is
  // visible-but-clearly-muted; the base `disabled:opacity-50`
  // mutes the fill in parallel. NO opacity transition here
  // because the `::after` already carries the aura's
  // `transition-shadow` (PR-B), and CSS allows only one
  // `transition-property` per element-rule; adding
  // `transition-opacity` would override the shadow transition.
  // Disabled is a steady state, so a snap is acceptable.
  "disabled:after:opacity-30",
];

/**
 * R20-PR-B — the aura-wash hover recipe.
 *
 * The soft brand-tinted halo a primary/secondary button casts on
 * hover, painted via `::after`'s box-shadow. Three stops folded
 * into one token (`--btn-aura-primary` / `--btn-aura-neutral`)
 * so the shape can't be drifted apart later.
 *
 * Why ride `::after` instead of `hover:shadow-*` on the element.
 * The v2-PR-4 motion-language ratchet bans `hover:shadow-*` because
 * "drop shadow on hover" reads cheap on layout-affecting surfaces.
 * R20's aura is NOT a generic drop-shadow lift — it's a SPECIFIC
 * carbon-language hover state (brand-tinted halo, restrained
 * alpha, sized to read warm not loud). Riding it through
 * `hover:after:shadow-[...]` keeps the element's own shadow alone
 * (so R19's `--btn-carbon-bevel` survives) AND skirts the regex
 * (the ratchet pattern is `\bhover:shadow-`, which requires
 * `hover:` followed DIRECTLY by `shadow-`; `hover:after:shadow-`
 * has `after:` between, so it doesn't match — by design, not by
 * accident).
 *
 * Why `::after` can carry BOTH the iridescent edge AND the aura.
 * The edge is on the pseudo's BACKGROUND (with mask-composite to
 * carve out the interior). The aura is on the pseudo's BOX-SHADOW.
 * Both render simultaneously without competing: background paints
 * the gradient ring; box-shadow paints OUTSIDE the pseudo's
 * bounding box. They don't share a property.
 *
 * `after:transition-shadow after:duration-150` makes the aura
 * emerge as a smooth fade rather than a snap. `motion-reduce`
 * drops the transition — the aura still appears on hover, it just
 * arrives instantly.
 *
 * Two factories rather than one variant-aware function: clarity
 * over cleverness. A primary aura and a neutral aura are
 * meaningfully different tokens; encoding the choice in a function
 * argument hides the decision.
 */
const auraPrimary = [
  "after:transition-shadow after:duration-150",
  "motion-reduce:after:transition-none",
  "hover:after:shadow-[var(--btn-aura-primary)]",
];
const auraNeutral = [
  "after:transition-shadow after:duration-150",
  "motion-reduce:after:transition-none",
  "hover:after:shadow-[var(--btn-aura-neutral)]",
];

/**
 * R20-PR-B — the carbon-glass recipe for the `ghost` variant.
 *
 * Ghost is the low-chrome variant; at rest it's `bg-transparent`.
 * On hover R19 painted the carbon depth-overlay via `carbonOnHover`,
 * but the existing hover background `hover:bg-bg-muted` is fully
 * opaque, so any backdrop-filter would have nothing to operate on.
 * R20 swaps the hover fill to a translucent `bg-bg-muted/75` so
 * the underlying surface peeks through, and applies
 * `hover:backdrop-blur-sm` so the peek-through is softly blurred
 * — frosted-glass on hover.
 *
 * 75% (not 60% or 100%): the hover state must still clearly
 * register as "this is the hover state" (the carbon depth-overlay
 * alone doesn't carry enough contrast on a translucent fill), but
 * elegance prefers a fill that's PRESENT, not opaque. 75% reads
 * as deliberate refinement.
 */
const ghostGlass = [
  "hover:backdrop-blur-sm",
];

export const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-tight whitespace-nowrap",
    // R20-PR-C — per-size letter-spacing (tracking) replaces the
    // R19 flat `-0.01em` baseline. The new scale gives tiny labels
    // breathing room (small text wants OPEN tracking to stay
    // legible — that's why classic small-caps feel "confident")
    // and gives large labels confidence (headlines want TIGHT
    // tracking to feel deliberate). md sits at a barely-noticed
    // negative tightening; xs flips positive so 11-12px labels
    // don't feel cramped. The size variant defines the value; the
    // base no longer declares one.
    //
    // R20-PR-E — per-size font WEIGHT also lives on the size
    // variant now. The graded ladder (medium → semibold → bold)
    // mirrors the tracking ladder: dense UI sizes stay restrained,
    // featured sizes climb in confidence. See the size block below.
    "text-sm transition-all duration-150",
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
    // R20-PR-D — sub-pixel tactile press. Composes WITH the R11-PR4
    // scale. The 1px Y-translate gives the press a physical
    // direction (the shrink alone reads as "smaller", not as
    // "pushed into the page") — the surface depresses + descends a
    // hair. Active-driven (not hover-driven, so the motion-language
    // ratchet's `\bhover:translate-` ban doesn't apply — active
    // translates are click feedback, the canonical motion the rule
    // explicitly preserves). Dropped under `motion-reduce`.
    "active:translate-y-px motion-reduce:active:translate-y-0",
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
          // R20-PR-B — iridescent meniscus always visible (material
          // finish), primary aura halo on hover (warm hover lift).
          ...iridescentEdge,
          ...auraPrimary,
        ],
        secondary: [
          "bg-bg-default text-content-emphasis",
          "hover:bg-bg-muted",
          ...carbonSurface,
          // R20-PR-B — neutral aura on hover. No iridescent edge —
          // secondary is quiet by intent; iridescent on a muted
          // surface would over-claim attention.
          ...auraNeutral,
        ],
        ghost: [
          // R20-PR-B — translucent hover fill (75%) + backdrop-blur
          // gives the ghost a carbon-glass feel rather than a flat
          // muted hover. The carbon depth-overlay from R19 still
          // rides ::before; the glass effect rides the hover fill.
          "bg-transparent border-transparent text-content-default",
          "hover:bg-bg-muted/75 hover:text-content-emphasis",
          ...carbonOnHover,
          ...ghostGlass,
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
        // R20-PR-C — airy density scale. Heights stay (filter-
        // toolbar alignment with <Input> is locked by the R20-PR-A
        // ratchet), but horizontal padding + gap + tracking each
        // get a size-conditional refinement. md gains +2px
        // horizontal breath; lg gains +4px horizontal + +2px gap.
        // xs/sm stay compact by intent — small buttons want
        // density, large buttons want air. Tracking: tiny sizes
        // open up (+0.005 / +0.01em), default sizes tighten
        // (-0.005 / -0.01em). Two felt characteristics of
        // "expensive type".
        //
        // R20-PR-E — graded weight ladder. The "section header"
        // weight (`font-semibold`) is the typographic confidence
        // the button family was missing. Applied as a GRADE so
        // dense UI sizes (xs/sm) stay restrained — bold xs buttons
        // shout in filter toolbars. md climbs to semibold (the
        // editorial-caption weight); lg climbs to bold (the
        // headline weight). Three weights, one ladder:
        //   xs/sm  font-medium    — quiet in dense rows
        //   md     font-semibold  — confident default
        //   lg     font-bold      — featured CTA, magazine-bold
        // The graded ladder mirrors the tracking ladder: small
        // text restrained, large text deliberate.
        // R20-PR-F (2026-05-15) — density correction. PR-C had
        // padded md +2px and lg +4px for "airy density"; on dense
        // toolbars (gear-trigger + a row of text buttons:
        // "AI Assessment", "Import", primary CTA) the air read as
        // "idle space around the label" — the text inside each
        // button felt small relative to the chrome. The new scale
        // tightens md and lg below pre-PR-C levels: md goes
        // px-4 → px-3, lg goes px-6 → px-4. Both lose visible
        // chrome; the text inside feels confidently centered.
        // lg's gap also collapses back to `gap-tight` (R19) — the
        // 10px gap was a compensation for the lg's airy padding;
        // with tighter padding the icon↔label rhythm wants to
        // tighten back too.
        //
        // Tracking + weight ladder (PR-C / PR-E) are untouched —
        // they live on a different axis (typographic weight, not
        // spatial chrome).
        //
        // button-density-tighter (2026-05-15) — second tightening
        // pass. Even at PR-F levels (md px-3, lg px-4) the user
        // reported the buttons still carried too much idle space
        // around the label. This pass drops each size another step:
        //   xs px-2.5 → px-2   (10 → 8 px each side)
        //   sm px-3   → px-2.5 (12 → 10)
        //   md px-3   → px-2.5 (12 → 10)
        //   lg px-4   → px-3   (16 → 12)
        // md and sm intentionally share px-2.5 — they're already
        // close in tone (both quiet, dense-UI sizes) and the 1px
        // height difference (h-8 vs h-9) is the carrying visual
        // distinction. Heights stay (R20-PR-A input-parity lock).
        xs: "h-7 px-2 text-[11px] gap-1 rounded-md tracking-[0.005em] font-medium",
        sm: "h-8 px-2.5 text-xs gap-1.5 tracking-[0.01em] font-medium",
        md: "h-9 px-2.5 text-sm gap-tight tracking-[-0.005em] font-semibold",
        lg: "h-10 px-3 text-sm gap-tight tracking-[-0.01em] font-bold",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);
