# 2026-06-30 — Org Portfolio dashboard: enterprise IA + visual polish

**Commit:** `<sha> feat(org-dashboard): enterprise IA + visual polish`

## Premise correction (honest starting point)

The driving prompt described a "scattered widget dump" with a
duplicated coverage card and repeated per-card "Last activity 9 hours
ago" noise. Verified against the repo (after Prompts 1–3 landed):

- **No duplicate coverage in the preset.** `DEFAULT_ORG_DASHBOARD_PRESET`
  has exactly one Coverage KPI. The deployed duplicate was per-org data
  drift, already fixed by the de-dup reconcile (`#1347`).
- **"Last activity" is per-tenant data, not widget noise.** It lives on
  each tenant card (`dashboard-sections.tsx`, `row.snapshotDate`) and
  tells you *which tenant* is stale — genuine information. The fix is to
  add a SINGLE dashboard-level "refreshed" line, **not** to strip the
  per-tenant signal.
- **The page is server-rendered**, so "per-band loading skeletons" maps
  to a Next route `loading.tsx`, not client loading states.

The genuinely-open composition problems were real, though: the maturity
radar sat alone in a half-width slot with an **empty right half** (the
"floating chart"), and the drill-down CTAs rendered *below* the
per-tenant list — backwards from "investigate → drill in".

## The 4-band information architecture

`DEFAULT_ORG_DASHBOARD_PRESET` now encodes a deliberate top-to-bottom
narrative — **glance → posture → investigate → per-tenant → programme**:

| Band | Widgets | y | Question it answers |
|---|---|---|---|
| (context) | ORG_THREAT_LEVEL banner (12×2) | 0 | "what's our posture headline?" |
| 1 — GLANCE | 4 KPI tiles (3×2 each) | 2 | "the at-a-glance numbers" |
| 2 — POSTURE | Security Maturity radar (6×4) + Open-Risks trend (6×4) | 4 | "where we stand + where we're trending" |
| 3 — INVESTIGATE | Drill-down CTAs (12×2) | 8 | "jump to the problem area" |
| 4 — PER-TENANT | Tenant-health donut (4×6) + Coverage-by-tenant list (8×6) | 10 | "which tenant, specifically" |
| 5 — PROGRAMME | Security Initiatives (12×4) | 16 | "what we're doing about it" |

Equal-height tiles within each band (Band 1 all h=2, Band 2 both h=4,
Band 4 both h=6) give a consistent visual rhythm. The maturity radar is
now paired with the trend at equal height (no orphaned half-row); the
tenant-health donut is grouped with the per-tenant list (both about
tenant health); drill-down sits above the per-tenant detail.

Existing orgs adopt the new IA via the **"Reset to recommended layout"**
action or `npm run db:reconcile-org-widgets -- --execute` — both reflow
to these preset positions.

## Whole-dashboard states

- **No-data onboarding.** A seeded org with zero tenants showed a grid of
  zero-value cards. It now shows a purposeful `EmptyState` ("Add tenants
  to populate your portfolio", ORG_ADMIN gets a "Manage tenants" CTA),
  gated on `summary.tenants.total === 0`. The pre-existing no-*widgets*
  empty state (un-seeded org) stays.
- **Dashboard-level "refreshed".** One header line — "Portfolio data
  refreshed … ago" — sourced from the summary's server-computed
  `generatedAt`. Provider-free + hydration-safe (relative form computed
  after mount; absolute long-form as the SSR fallback). Per-tenant "Last
  activity" stays — it is per-tenant data.
- **Banded loading skeleton.** `loading.tsx` → `DashboardSkeleton`
  mirrors the IA bands at the right sizes (no layout shift), built on the
  shared `<Skeleton>` primitive + semantic spacing. It is the nearest
  `loading.tsx` for the org `(app)` segment; a sub-route can override with
  its own.

## Design-system discipline

Semantic spacing scale (`space-y-section` between bands, `space-y-default`
/ `gap-default` within), semantic border tones only (no raw tailwind
colour scales), the `<EmptyState>` + `<Skeleton>` primitives — no
hand-rolled equivalents. The skeleton tiles are intentionally borderless
(a skeleton is a fill, not a card) to avoid pushing the down-only
border-tone budget.

## Files

| File | Role |
|---|---|
| `src/app-layer/usecases/org-dashboard-presets.ts` | Preset reorganized into the 4-band IA + updated layout sketch. |
| `src/app/org/[orgSlug]/(app)/PortfolioDashboard.tsx` | Dashboard-level "refreshed" line; no-data onboarding state. |
| `src/app/org/[orgSlug]/(app)/DashboardSkeleton.tsx` | Banded loading skeleton mirroring the IA. |
| `src/app/org/[orgSlug]/(app)/loading.tsx` | Route-segment fallback → `DashboardSkeleton`. |
| `tests/guards/org-dashboard-composition.test.ts` | Ratchet: 4-band IA, no overlaps/dups, whole-dashboard states, spacing/border discipline. |
| `tests/unit/org-dashboard-preset.test.ts` | Position assertions updated to the new IA. |

## Decisions

- **Kept per-tenant "Last activity".** It is per-tenant data, not the
  dashboard refresh signal — the prompt conflated the two. Added the
  dashboard-level line; left the per-tenant one alone.
- **Preset change is forward-compatible.** New orgs get the IA at seed;
  existing orgs keep their (possibly drifted) layout until they reset /
  reconcile — no destructive auto-migration.
- **Borderless skeleton tiles.** Avoids incrementing the down-only
  `border-tone-budget`; a grey fill reads as "loading" without a card
  border.
- **Provider-free "refreshed" line.** The sanctioned `TimestampTooltip`
  needs a Radix provider absent when the dashboard renders in isolation
  (crashed the rendered tests); a plain relative-time span is the right
  primitive for a non-interactive header meta.
