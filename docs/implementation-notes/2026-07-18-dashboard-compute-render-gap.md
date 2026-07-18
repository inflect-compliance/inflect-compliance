# 2026-07-18 — Tenant dashboard: closing the compute-vs-render gap

**Commit:** `<sha>` feat(dashboard): close the compute-vs-render gap

## Design

The executive dashboard's data layer computed several things the UI
never rendered, its KPI tiles couldn't navigate, and its "filter"
context filtered nothing. Six remediations closed the gap between what
`getExecutiveDashboard` computes and what a user can act on.

1. **Surface or stop computing.**
   - **Surfaced** `exec.exceptions` (G-5) and `exec.treatmentPlans`
     (G-7) as two health cards (`ExceptionSummaryCard` /
     `TreatmentPlanCard`) built on a shared `DrillHealthCard`. Neither
     entity has a dedicated list page (exceptions live per-control,
     treatment plans per-risk), so each card drills through to its
     parent-entity list (`/controls`, `/risks`).
   - **Removed** the genuinely-dead compute: `controlsByStatus`
     (payload + usecase + `getControlsByStatus`) and the never-read
     `DashboardStats` fields `assets` / `clausesReady` / `totalClauses`
     / `unreadNotifications`. That deleted three `getStats` queries
     (`asset.count`, `clauseProgress.findMany`, `notification.count`).
     `controls` and `overdueEvidence` were KEPT — the removal-safety
     scan initially flagged them as dead, but `assistant.ts` reads both
     via `getDashboardData`.

2. **KPI drill-through.** A `<KpiTile>` wrapper in `DashboardClient`
   renders an `ArrowUpRight` `next/link` as a SIBLING overlay (not a
   wrapper) of each `<KpiCard>`'s R17 focus button — nesting an `<a>`
   inside the `role="button"` chassis would be invalid, and the shared
   `KpiCard` primitive stays lean (its import allow-list forbids
   `next/link`). The focus-on-click interaction is untouched; the corner
   link navigates.

3. **"Filter" → "focus".** Per-resource data filtering has no coherent
   meaning ("filter the evidence donut to the risks KPI"?), so the
   context was renamed `DashboardChartFilter` → `DashboardChartFocus` /
   `useDashboardChartFocus`, and the aspirational "re-render with data
   filtered to the selected resource" docstring was replaced with an
   honest description of the ring+dim highlight it actually is.

4. **SWR invalidation.** The three mutation sites that shift a headline
   KPI — control status flip, risk bulk status/delete, evidence upload
   — now invalidate `CACHE_KEYS.dashboard.executive()`. The trends key
   was changed to `trends(days = 30)` so it carries its `?days=` window
   and a `mutate(dashboard.trends())` matches the live entry.

5. **Recent Activity.** New `getRecentActivityDetailed` resolves each
   audit row's entity title via a bounded fan-out (one `findMany` per
   distinct entity type in the 10-row window, never per-row). The new
   pure `src/lib/audit/activity-humanize.ts` maps the raw `action` /
   `entity` enums to localized verb/noun i18n keys and a link path.
   Rows now read "Jane approved policy 'Access Control'" and link to
   the item.

6. **Permission + skeleton.** Posture regenerate moved from
   `reports.export` to `controls.edit` (the posture summary is derived
   from control state). A new dashboard-specific `DashboardSkeleton`
   replaces the shared `SkeletonDashboard` in `loading.tsx` so the
   streamed shell mirrors the shipped layout.

## Files

| File | Role |
| --- | --- |
| `src/app-layer/repositories/DashboardRepository.ts` | Pruned dead stats/`controlsByStatus`; added `getRecentActivityDetailed` + title resolvers |
| `src/app-layer/usecases/dashboard.ts` | Dropped `controlsByStatus` from the payload |
| `src/lib/audit/activity-humanize.ts` | New — pure verb/noun/link humaniser |
| `src/app/t/[tenantSlug]/(app)/dashboard/RecentActivityCard.tsx` | Humanised + identified + linked rows |
| `src/app/t/[tenantSlug]/(app)/dashboard/DashboardChartContext.tsx` | Filter → focus rename + honest docstring |
| `src/app/t/[tenantSlug]/(app)/dashboard/DashboardClient.tsx` | Exception/treatment cards, KPI hrefs, permission, focus rename |
| `src/components/ui/skeleton.tsx` | New `DashboardSkeleton` — layout-matching loading skeleton |
| `src/lib/swr-keys.ts` | `trends(days=30)` carries its window |
| `src/app/.../controls/[controlId]/page.tsx`, `.../evidence/UploadEvidenceModal.tsx`, `.../risks/RisksClient.tsx` | Invalidate the executive dashboard key on mutation |
| `src/app/api/.../posture-summary/regenerate/route.ts` | Gate on `controls.edit` |

## Decisions

- **Surface AND prune, not one-or-the-other.** Exceptions/treatment
  plans are valuable, so they were surfaced; `controlsByStatus` + the
  four dead stat fields are pure waste with no surface, so they were
  removed. `controls`/`overdueEvidence` survived because the assistant
  read-path consumes them — verified by reading `assistant.ts`, not by
  trusting the field-usage grep.
- **KPI focus stays; navigation is additive.** Rather than replace the
  R17 focus interaction (locked by four ratchets), the drill link is a
  separate corner affordance — both interactions coexist.
- **Title resolution is bounded.** `getRecentActivityDetailed` groups
  the 10 rows by entity type and issues one `findMany` per type with
  `id: { in: ids }` + `take: ids.length` — bounded twice, off the
  unbounded-findMany budget, and not an N+1.
