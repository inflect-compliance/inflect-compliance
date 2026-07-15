# 2026-07-15 — Surface hidden vendor controls + enum/filter cleanup

**Commit:** `<pending> feat(vendors): surface hidden monitoring/bundle controls + enum/filter cleanup`

## Design

Several fully-built vendor capabilities were unreachable from the UI, some
signals were stubbed-by-default without saying so, and there was enum/filter
drift. This wires the seams up honestly. No schema change.

- **Monitor config (P3.1).** `updateVendorMonitor` + `PATCH /monitor` (5 boolean
  toggles: `enabled`, `checkAttestation/Breach/Tls`, `materializeFindings`)
  existed end-to-end but `VendorMonitoringPanel` was read-only. Added a
  write-gated settings card of `<Switch>` toggles, each PATCHing one field.
  `materializeFindings` is the lever that turns posture events into Findings
  (the reachability gate PR2's Risk-linkage hangs off) — now operator-toggleable.
- **Honest stub labeling (P3.2).** Breach + TLS default to deterministic stubs
  unless `VENDOR_MONITOR_BREACH_PROVIDER`/`_TLS_PROVIDER` name a real provider.
  `getVendorPosture` now returns `providers: { breach, tls }` (derived from env,
  mirroring the factory selection); the panel shows a muted "Demo" caption on the
  breach/TLS tiles in stub mode. Attestation is genuinely real → left unlabeled.
- **Bundle items (P3.3).** `addBundleItem`/`removeBundleItem`/`getEvidenceBundle`
  existed but the bundles tab only created + froze. Added a bundle-detail view
  (items list + add via EntityPicker + remove) with Freeze disabled while empty.
- **Enum/filter cleanup.** Status filter reconciled to the 4 real `VendorStatus`
  values (dropped non-enum `UNDER_REVIEW`/`SUSPENDED`, added `OFFBOARDING`) (P3.4);
  the `riskRating` filter is now forwarded from the SSR page (the repo already
  supported it via `assessments: { some }`) (P3.5); list + detail badges render
  localized labels instead of raw enum tokens (P3.6).
- **Cleanup (P3.7).** Removed the dead `contractEnd` MetaStrip branch (no such
  field; real field is `contractRenewalAt`). Added a recursive nth-party
  subprocessor **chain** view: `listSubprocessorChain` loads the tenant's
  relationship edges in ONE query, builds the tree in memory bounded by
  `maxDepth`, and marks any ancestor repeat `cyclical` (no infinite recursion).

## Files

| File | Role |
| --- | --- |
| `usecases/vendor-monitoring.ts` | `getVendorPosture` returns provider mode. |
| `_components/VendorMonitoringPanel.tsx` | Config toggles + stub badges. |
| `usecases/vendor-audit.ts` + `.../subprocessors/chain/route.ts` | Recursive `listSubprocessorChain`. |
| `vendors/[vendorId]/page.tsx` | Bundle items UI, localized badges, contractEnd removal, subprocessor tree. |
| `vendors/page.tsx` | Forward `riskRating` SSR param. |
| `vendors/filter-defs.ts` + `VendorsClient.tsx` | Status-enum reconcile + list badge localization. |

## Decisions

- **Provider mode is env-derived, not per-tenant** — matches the global factory
  selection; exposed read-only so the UI can flag demo signals without a schema
  column.
- **Recursive chain is bounded + cycle-safe by an ancestor set**, and loads all
  edges once (no per-node round-trip) to stay within the N+1 guardrail.
- **Status filter follows the settable enum**, not the reverse — the two extra
  filter-only values matched nothing, so they're dropped rather than added as
  new statuses.
