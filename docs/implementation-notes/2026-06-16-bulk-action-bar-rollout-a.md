# 2026-06-16 — Canonical BulkActionBar rollout (wave A: Risk · Control · Vendor · Test plan)

**Commit:** `<pending>` feat(bulk): canonical BulkActionBar — Risk/Control/Vendor/Test plan

## Design

Phase 1 (#1100) extracted `<BulkActionBar>` from the Tasks table; Phase 2
(#1101) wired Assets. This wave rolls the same primitive out to four more
entity tables. Each gets a tenant-scoped **Set status** + **Assign owner**
bar in the DataTable's `selectionControls` slot, backed by a real
`updateMany` endpoint — never a per-id loop.

The vertical for every entity mirrors the Assets reference:

```
route  POST /<entity>/bulk/{status,assign}   (withValidatedBody + getTenantCtx)
  → usecase  bulkSet<E>Status / bulkAssign<E>   (assert<write> → listByIds → bulkUpdate → per-row audit)
    → repo   <E>Repository.listByIds + .bulkUpdate   (one updateMany, where tenantId = ctx.tenantId)
```

Frontend wiring adapts to each client's existing data layer (the bar
itself is data-layer-agnostic — it only needs `onApply` + `applying`):

- **Controls** — React Query → `invalidateQueries`. Already had selection
  but drove a **per-id N+1** (`bulkSetStatus` looped one POST per row into
  `/controls/{id}/status`) via the older `batchActions` API. This wave
  replaces that with `selectionControls: <BulkActionBar>` and the single
  `/controls/bulk/*` endpoints — a correctness win, not just a UI swap.
- **Risks, Vendors** — SWR (`useTenantSWR`) → `query.mutate()` revalidate.
- **Test plans** — fetch-on-mount → `fetchData()` refetch.

## Files

| File | Role |
|------|------|
| `src/lib/schemas/index.ts` | 8 new bulk Zod schemas (batch-capped at 100, status enum'd) |
| `src/app-layer/repositories/{Risk,Control,Vendor,TestPlan}Repository.ts` | `listByIds` + `bulkUpdate` (one `updateMany`, tenant-filtered) |
| `src/app-layer/usecases/risk.ts`, `vendor.ts`, `control-test.ts`, `control/mutations.ts` (+ barrel) | `bulkSet<E>Status` / `bulkAssign<E>` (assert + audit per row) |
| `src/app/api/t/[tenantSlug]/{risks,controls,vendors,tests/plans}/bulk/{status,assign}/route.ts` | 8 POST routes |
| `…/(app)/{risks/RisksClient,vendors/VendorsClient,controls/ControlsClient,tests/page}.tsx` | mount `<BulkActionBar>` in `selectionControls` |
| `tests/guards/bulk-actions-rollout.test.ts` | per-entity structural ratchet (backend + client) |
| `tests/guards/b1-selection-header-bar.test.ts`, `right-rail-discipline.test.ts`, `tests/unit/controls-list-polish.test.ts` | updated: Controls now uses `selectionControls`/`BulkActionBar`, not `batchActions` |

## Decisions

- **Status enum per entity, no free-text.** Each `Bulk<E>StatusSchema`
  enumerates the entity's full status set; an out-of-range value 400s at
  the route. Risk/Control/Vendor/TestPlan statuses are free transitions
  (no state machine), so any-to-any bulk status is safe.
- **Evidence + Policy deferred to wave B, Audits to a later phase.**
  Evidence (reviewer-identity review chain) and Policy (publish-approval
  gate) have workflow-gated status — a blind `updateMany` would bypass the
  guards, so their bars are assign-focused (Policy adds Archive). Audits
  (AuditCycle) has no owner, a sequential lifecycle, and no DataTable yet,
  so it needs a list-page rebuild first. Both decisions were the operator's.
- **Controls N+1 retired.** The pre-existing `bulkSetStatus` fired one
  request per selected control; replaced by a single `updateMany` call.
  The three `batchActions` verbs (Mark Implemented / Needs Review / Not
  Applicable) collapse into the bar's full status picker.
- **Per-row audit, not per-batch.** Each affected row gets its own
  hash-chained `logEvent` (matching the Assets bulk pattern) so the audit
  trail stays per-entity, with a `(bulk)` summary marker.
- **Tenant-filtered `updateMany`.** Both `listByIds` and `bulkUpdate`
  filter `tenantId: ctx.tenantId`; global library controls (`tenantId`
  NULL) are silently excluded, mirroring `setControlStatus`'s guard.
