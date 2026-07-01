# 2026-07-01 — Framework-version delta-gap engine (Regwatch 2A)

**Commit:** `<pending> feat(regwatch): framework-version delta-gap engine + importer wiring`

## Design

When a framework version N+1 lands in the library, each tenant that has the
framework installed should learn EXACTLY what changed and what their new gap is,
rather than re-diffing the whole standard by hand. Two records model this:

- **`FrameworkVersionDiff`** — GLOBAL (no `tenantId`, no RLS). The computed
  diff between two versions of a framework's requirement set: added / changed /
  removed requirement codes + a human changelog. One row per
  `(frameworkKey, fromVersion, toVersion)`.
- **`TenantFrameworkDelta`** — tenant-scoped (RLS). What that diff MEANS for one
  tenant: the new uncovered gaps (added requirements with no mapped control) and
  the tenant's controls flagged for re-review (mapped to a changed requirement).
  One row per `(tenantId, diffId)`, with a `NEW / REVIEWED / DISMISSED` review
  state.

Flow:

```
importLibrary (version update)
  → history entry now carries the real added/changed/removed codes
  → recordDiffFromVersionHistory(key)   → upsert FrameworkVersionDiff (global)
  → propagateFrameworkDelta(diffId)
       for each INSTALLED tenant (has ≥1 ControlRequirementLink to the framework):
         withTenantDb(tenantId):                        # RLS-scoped
           flag controls mapped to a CHANGED requirement → status NEEDS_REVIEW
           upsert TenantFrameworkDelta (new gaps + flagged controls)
           notify active members (deduped per user/day)
```

Findings are NOT auto-created. A human opts into materialising them from the UI
(`materializeDeltaFindings`) — idempotent (one finding per requirement code,
deduped on `sourceKind + sourceRef`), source-tagged `FRAMEWORK_UPDATE`.

## Files

| File | Role |
| --- | --- |
| `prisma/schema/compliance.prisma` | `FrameworkVersionDiff` (global) + `TenantFrameworkDelta` (RLS) models |
| `prisma/schema/enums.prisma` | `FrameworkDeltaStatus` (NEW / REVIEWED / DISMISSED) |
| `prisma/migrations/20260701160000_framework_version_delta/` | tables + indexes + RLS policies (TenantFrameworkDelta only) |
| `src/app-layer/usecases/framework-delta.ts` | the engine: record diff, propagate per-tenant, tenant read/review, materialise findings |
| `src/app-layer/services/library-importer.ts` | wires the trigger into the version-update path + threads real diff codes into version history |
| `src/app/api/t/[tenantSlug]/framework-updates/**` | list / get / review / materialize-findings routes |
| `src/app/t/[tenantSlug]/(app)/framework-updates/**` | tenant review queue page + client |

## Decisions

- **Global diff, per-tenant delta.** Framework structure is identical for every
  tenant, so the diff is computed once and stored globally; only the
  personalised impact is RLS-scoped. Keeps the fan-out cheap and the diff
  cacheable.
- **Install = derived, not declared.** "Installed" means the tenant has ≥1
  `ControlRequirementLink` to one of the framework's requirements — there is no
  separate install table to keep in sync. Propagation enumerates installed
  tenants from that link.
- **Per-tenant fan-out under `withTenantDb`.** Each tenant's reads/writes run in
  their own RLS transaction, so they can't be hoisted into one cross-tenant
  query — the propagate loop carries a `guardrail-allow: n+1` with that reason.
- **The importer had to fill the history codes first.** The version-history
  entry for UPDATES previously stored empty added/changed/removed arrays (a
  never-completed TODO). Since `recordDiffFromVersionHistory` reads the diff FROM
  that history, the trigger would have been a silent no-op. The fix threads the
  resolved diff codes through `ImportResult` into the history entry — which also
  makes the stored version history accurate for the first time.
- **Fail-safe trigger.** Propagation runs after the import has committed and is
  wrapped in try/catch — a broken fan-out never fails the import. Gated by a
  `propagateDelta` option (default on) so seeds/tests can opt out. Never fires on
  first create (no prior version to diff).
- **Findings are opt-in.** Auto-creating findings for every added requirement on
  every tenant would be noisy and hard to undo; materialisation is an explicit,
  idempotent, source-tagged human action instead.
