# 2026-06-30 — Org-dashboard widget integrity (de-dup + titles + reconciliation)

**Commit:** `<sha> fix(org-dashboard): de-dup widgets + guarantee titles + reconciliation`

## Design

The deployed org dashboard rendered a mess that didn't match the clean
preset — duplicated tiles, untitled charts, raw-slug labels. Three root
causes (two confirmed as stated, one corrected):

1. **Drift never self-corrects.** `seedDefaultOrgDashboard` short-circuits
   when an org has ANY widgets (`count > 0` → no-op). An org seeded from
   an older/smaller preset, or whose widgets got duplicated, stays broken
   forever — there was no reconciliation path, and there's no DB
   uniqueness on `(organizationId, type, chartType)` to prevent dupes.

2. **Title fallback leaked slugs.** `widget-dispatcher.tsx` fell back to
   the raw `chartType` in three places (the KPI default arm, the chart
   `title`, and the trend `seriesLabel`), so a null-title widget rendered
   "risks-open" / untitled instead of a human title.

3. **Per-tenant cards — premise corrected.** The "3× Overdue evidence"
   the screenshot showed are NOT mislabeled per-tenant cards. Each tenant
   card correctly binds the **tenant name** as its title
   (`dashboard-sections.tsx` `row.name`, keyed by `row.tenantId`). The
   repeated "Coverage" / "Overdue evidence" strings are the **static kv
   metric labels** rendered once per card (the `value` is per-tenant).
   The visible *duplication* is a duplicated **widget** (cause #1), not a
   card-binding bug — so the fix is widget de-dup, not a card change.

## The contract

- **One canonical title source.** `org-dashboard-widget-titles.ts` exports
  `WIDGET_TITLES` (keyed by `${type}/${chartType}` — `coverage` is reused
  across KPI and TENANT_LIST, so a chartType-only map would collide) and
  `resolveWidgetTitle(type, chartType, title)`, which returns a GUARANTEED
  human title (own title → canonical map → sentence-cased fallback) —
  never a slug. The dispatcher and the create-usecase both route through
  it; the preset and the backfill share the same map.

- **Create can't persist an untitled widget.** `createOrgDashboardWidget`
  defaults the title via `resolveWidgetTitle` at write time.

- **A reconciliation path.** Org admins (`canConfigureDashboard`) get a
  "Reset to recommended layout" action that deletes the org's widgets and
  re-seeds `DEFAULT_ORG_DASHBOARD_PRESET` (deliberate reset, preserve
  nothing). A one-off `scripts/reconcile-org-dashboard-widgets.ts`
  (dry-run default, `--execute`) repairs every org in place — de-dup
  (keep earliest per `(type, chartType)`), backfill null titles, re-flow
  positions so nothing overlaps. **Idempotent**: a reconciled org reports
  "no changes".

## Files

| File | Role |
|---|---|
| `src/app-layer/usecases/org-dashboard-widget-titles.ts` | Canonical `WIDGET_TITLES` + `resolveWidgetTitle`. |
| `src/app/org/[orgSlug]/(app)/widget-dispatcher.tsx` | All three title fallbacks route through `resolveWidgetTitle`. |
| `src/app-layer/usecases/org-dashboard-widgets.ts` | `createOrgDashboardWidget` defaults the title; `resetOrgDashboardToPreset` action. |
| `src/app/api/org/[orgSlug]/dashboard/widgets/reset/route.ts` | POST → reset action (`canConfigureDashboard`). |
| `scripts/reconcile-org-dashboard-widgets.ts` | Idempotent de-dup + title-backfill + position re-flow. |
| `tests/guardrails/org-widget-integrity.test.ts` | Ratchet: preset no-dups, titles complete, no slug fallback, reset gated, script idempotent. |

## Decisions

- **`${type}/${chartType}` keys, not `chartType`.** The same chartType is
  reused across widget types (`coverage` → both "Coverage" and "Coverage
  by Tenant"), so a chartType-only title map would collide.
- **Reset = delete + re-seed, no preservation.** A deliberate "give me the
  recommended layout back" — simpler + more predictable than a merge, and
  the user explicitly asked for a clean reset.
- **Script over SQL migration.** The preset is typed TS; the repo's idiom
  (`backfill-org-dashboard-widgets.ts`) is a tsx script that imports the
  real preset rather than duplicating it in raw SQL.
- **No tenant-card change.** Investigation showed the per-tenant binding
  is correct — fixing it would have been a no-op against a non-bug.
