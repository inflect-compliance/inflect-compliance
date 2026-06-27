# 2026-06-27 — Policy detail: Mappings + Traceability tabs

**Commit:** `<pending> feat(policy): mappings + traceability tabs on policy detail`

## Design

The Policy detail page gained two read-only tabs mirroring the canonical
Asset detail page:

- **Mappings** — framework requirement coverage the policy inherits from
  its linked controls. Reuses the existing `<InheritedMappingsPanel>`
  (the same component the Asset/Risk pages mount), pointed at a new
  `GET /policies/[id]/mappings` endpoint.
- **Traceability** — the policy's directly-linked Controls plus the
  Risks and Assets reachable *through* those controls. Rendered by a new
  read-only `<PolicyTraceabilityPanel>` against
  `GET /policies/[id]/traceability`.

The relationship model is the load-bearing decision. A policy links
**directly** to controls via `PolicyControlLink`. It has **no** direct
edge to risks, assets, or framework requirements — those are *inherited*
by walking the policy's controls:

```
Policy ──PolicyControlLink──▶ Control ──RiskControl──────▶ Risk
                                      ├─ControlAsset──────▶ Asset
                                      └─ControlRequirementLink─▶ FrameworkRequirement
```

So both tabs are aggregators over the policy's controls, identical in
shape to the existing `inherited-control-data.ts` Asset/Risk
aggregators. Risks/assets are deduped by id and tagged with a
`viaControls` count ("via N controls").

## Why read-only (not the editable `TraceabilityPanel`)

The Asset Traceability tab uses the editable `TraceabilityPanel`
(link/unlink per section) because an asset links *directly* to both
controls and risks. A policy does not: risk/asset coverage is derived,
never set on the policy. Forcing policy into `TraceabilityPanel` would
imply directly-editable risk/asset links that don't exist in the schema.
A focused read-only panel matches the data model and the user ask
("where mapped frameworks and related risk/controls/risks are *listed*").
Controls are managed through the existing policy↔control link flow
(`POST /policies/[id]/control-links`).

## Files

| File | Role |
| --- | --- |
| `src/app-layer/usecases/inherited-control-data.ts` | `+controlsForPolicy` helper, `+getPolicyInheritedMappings` (reuses `mappingsForControls`) |
| `src/app-layer/usecases/traceability.ts` | `+getPolicyTraceability` — direct controls + deduped inherited risks/assets with `viaControls` count |
| `src/app/api/t/[tenantSlug]/policies/[id]/mappings/route.ts` | **new** GET route |
| `src/app/api/t/[tenantSlug]/policies/[id]/traceability/route.ts` | **new** GET route |
| `src/components/PolicyTraceabilityPanel.tsx` | **new** read-only 3-section panel (Controls / Risks / Assets) |
| `src/app/t/[tenantSlug]/(app)/policies/[policyId]/page.tsx` | wire the two tabs (`InheritedMappingsPanel` + lazy `PolicyTraceabilityPanel`) |
| `tests/integration/inherited-control-data-usecase.test.ts` | extended: policy mappings + traceability + bare-policy empty short-circuit |
| `tests/unit/policy-detail-mappings-traceability-adoption.test.ts` | **new** structural ratchet for the two tabs |

## Decisions

- **Reuse over re-author.** Mappings is the exact `InheritedMappingsPanel`
  the Asset page uses (`entityLabel="policy"`); no new component. Only the
  traceability panel is new, because no read-only equivalent existed.
- **`AGG_TAKE`/`POLICY_TRACE_TAKE = 200`** caps each query, matching the
  Asset/Risk aggregators — bounded reads, no unbounded `findMany`.
- **`viaControls` count** surfaces *why* a risk/asset appears (how many of
  the policy's controls reach it) without exposing the full control fan-out.
- **Empty short-circuit**: a policy with zero linked controls returns
  `{controls:[], risks:[], assets:[]}` without firing the risk/asset
  queries (mirrors the `controlIds.length === 0` guard in the Asset path).
