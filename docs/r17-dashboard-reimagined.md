# Roadmap-17 — Dashboard Reimagined

The executive dashboard is the first surface every user sees on
sign-in. R17 turned it from a static report into a coordinated,
gently-animated, interactive surface. The roadmap shipped 12 PRs
across the masthead, the KPI grid, the chart sections, the
next-best-action card, and the first-paint choreography.

## Visible deliverables

### Masthead — `<HeroMetric>`
- **Ambient brand glow** (PR-1): soft 640×400 radial wash anchored
  under the 72px verdict number. `var(--brand-subtle)` → transparent
  at 72% fade. Warmth without competing with the value.
- **6-second breath** (PR-2): the glow's opacity drifts 0.65 → 1 →
  0.65 on a 6s ease-in-out loop. Same identity-tier rhythm as the
  R14 brand-mark pulse and the R15 nav-band halo-breath. The
  masthead reads as gently alive.
- **Trend sparkline** (PR-3): a 120×32 `<MiniAreaChart>` above the
  delta chip showing the trajectory INTO the current value.
  Variant tone derives from the delta semantic — good → success,
  bad → error, neutral → muted. The chip text colour and the
  spark stroke colour are identical, so the trajectory + the
  delta read as one unit.

### KPI tiles — `<MetricCard>` / `<KpiCard>`
- **Corner glow** (PR-4): tiny 200px radial wash anchored at the
  upper-left where the icon + eyebrow sit. Smaller and quieter
  than the masthead — proportional to each tile's visual weight
  in the dashboard hierarchy. NO breath: 3-6 cards breathing in
  lockstep would be hypnotic.
- **Click-to-light** (PR-7): all 6 tiles are keyboard-accessible
  buttons (role / tabIndex / aria-pressed / Enter+Space). Click
  a tile → `ring-2 ring-brand-default` + amped corner glow (240px
  brand-muted vs the static 200px brand-subtle). Click again →
  clear. Click another → swap.

### Chart-filter coordination
- **Foundation** (PR-6): `DashboardChartContext` holds
  `{selectedKpi, setSelectedKpi, toggleSelectedKpi}` with the
  6-key union `'coverage' | 'risks' | 'evidence' | 'tasks' |
  'policies' | 'findings'`. Used as the single source of truth
  for "what's the user focused on right now."
- **Donut subscribes** (PR-8): the Risk Distribution card gains
  a brand ring + "Focused" badge when `selectedKpi === 'risks'`.
  When ANY OTHER KPI is selected, it dims to opacity-60. When
  nothing is selected, it renders the baseline.
- **Wrapper generalizes the pattern** (PR-9): `<ChartFocusWrapper
  kpiKey="...">` exposes the same focus/dim recipe to Control
  Coverage and Evidence Status. Three of six KPI tiles now
  visually connect to a chart; the wrapper is the seam for
  wiring the remaining three.

### Next-best-action card
- **Urgency-tinted glow** (PR-10): the action.id maps to a
  CSS token. Overdue → `--bg-error`, high-risks → `--bg-warning`,
  low-coverage → `--bg-info`, readiness-check → `--brand-subtle`.
  The eye registers urgency before reading the words.
- **"All clear" check** (PR-11): a small `text-content-success`
  `CheckCircle2` next to the heading when `action.id ===
  "readiness-check"`. The dashboard's "you did it" feedback —
  positive reinforcement only on the resting state, never on
  an urgent one.

### First-paint
- **600ms rise-in** (PR-12): `<DashboardLayout>` swapped its
  bare 150ms `animate-fadeIn` for `animate-dashboard-rise-in`
  (600ms ease-out + 8px translateY-from-below). Propagates to
  all 7 dashboard surfaces (executive / tests / risks /
  controls / tasks / vendors / coverage) — one consistent
  first-paint feel.

## Deferred

- **PR-5** — count-up animation on KPI value mount. The straightforward
  implementation (start at 0, then set the real value in a
  `useEffect`) introduces an SSR / hydration boundary flash —
  the server renders the real value, the client hydrates with
  the real value, then the effect sets to 0 and animates back.
  Revisit when a future render boundary lets it land cleanly.

## Tokens + animations introduced

| Token / Animation | Where | Purpose |
|---|---|---|
| `hero-glow-breath` | `tailwind.config.js` keyframes + animation | 6s opacity drift for the masthead glow (PR-2) |
| `dashboard-rise-in` | `tailwind.config.js` keyframes + animation | 600ms ease-out first-paint rise (PR-12) |
| `--brand-subtle` (existing) | `before:bg-[radial-gradient(...)]` on multiple surfaces | Ambient warmth on hero / KPI cards / readiness-check |
| `--bg-error` / `--bg-warning` / `--bg-info` (existing) | `URGENCY_GLOW_BY_ID` map in `NextBestActionCard.tsx` | Per-urgency tone on the next-best-action glow |
| `--brand-default` / `--brand-muted` (existing) | `MetricCard` selected recipe | Selected-state ring + amped glow |

All animations are honoured by the global
`prefers-reduced-motion: reduce` rule in `tokens.css` — no
per-component opt-in.

## Contract surfaces (rendered DOM)

| Attribute | Where | Used by |
|---|---|---|
| `data-hero-ambient-glow` | `<HeroMetric>` wrapper | PR-2/3 + future masthead PRs |
| `data-hero-metric-sparkline` + `data-hero-metric-sparkline-variant` | `<HeroMetric>` trend slot | PR-3 ratchet + downstream consumers |
| `data-metric-card-corner-glow` | `<MetricCard>` wrapper | PR-4 ratchet |
| `data-metric-card-selected` | `<MetricCard>` when selected | PR-7 ratchet + E2E selectors |
| `data-chart-focus-key` + `data-chart-focus` + `data-chart-dimmed` | `<ChartFocusWrapper>` | PR-9 ratchet + future telemetry |
| `data-next-best-action-urgency-glow` | `<NextBestActionCard>` wrapper | PR-10 ratchet |
| `data-next-best-action-clear-check` | `<NextBestActionCard>` heading icon | PR-11 ratchet |

## Ratchet layout

Per-PR ratchets live in `tests/guards/r17-*.test.ts`. The
capstone at `tests/guards/r17-capstone-rollout.test.ts` is the
inventory — it locks every R17 deliverable's presence so a
future "let's clean this up" diff that silently drops one of
the surfaces fails CI.

Adding a new R17 surface? Three steps:
1. Write the per-PR ratchet next to the file you edit.
2. Append a `describe` block to `r17-capstone-rollout.test.ts`.
3. Update this doc.
