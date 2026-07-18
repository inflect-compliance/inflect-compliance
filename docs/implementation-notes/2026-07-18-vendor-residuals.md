# 2026-07-18 — Vendor surface second-order residuals (PR-T)

**Commit:** `<pending> fix(vendors): hydrate bundle labels, localize edit enums, relabel riskRating filter, delete orphaned adapter, dedupe activation gate, surface subprocessor residency fields (Prompt 2)`

## Design

Six second-order residuals on the now-mature vendor surface — fix the ones that
mislead users, clear the dead code.

1. **Bundle-item labels.** The evidence-bundle items rendered `{it.entityId}` (raw
   cuid) + a type badge, though `VendorBundleItem.snapshotJson` was already
   fetched. Now reads `snap.title ?? snap.name` from the frozen snapshot (only
   `VENDOR_DOCUMENT` snapshots carry a title today), falling back to the cuid.
   `CONTROL` items hyperlink to `/controls/{id}` (reusing `LINK_ENTITY_HREF`);
   `VENDOR_DOCUMENT`/`ASSESSMENT`/`EVIDENCE` render as plain text (no standalone
   tenant detail route — evidence detail is a Sheet, not a route).

2. **Edit-form enum localization.** The raw module consts (`{value:s,label:s}`)
   were replaced with in-component `useMemo` option arrays using the existing
   read-view keys (`statusOption.*`, `criticalityLabel.*`); the residualRisk
   selected label is localized; `dataAccess` gets a localized label (`form.data*`)
   — rendered as a `<span>` rather than a badge to stay under the vendor page's
   tight StatusBadge-density budget.

3. **riskRating filter vs dashboard — decision: relabel.** The filter matched ANY
   historical assessment (`assessments: { some: { riskRating } }`) while the
   dashboard buckets by the LATEST assessment's rating. Prisma relation filters
   can't express "the latest row has X" without denormalization, and the
   dashboard's metric is intentionally assessment-derived (not the
   manually-editable `inherentRisk`), so denormalizing would pollute it. The
   filter is **relabeled "Ever rated {X}"** with a description noting the
   dashboard buckets by latest — honest rather than silently disagreeing.

4. **Orphaned lifecycle adapter — decision: delete.**
   `vendor-assessment-lifecycle-adapter.ts` was imported only by its own tests and
   built on the retired World-A statuses (DRAFT/IN_REVIEW/APPROVED/REJECTED).
   VendorAssessment runs on its own Epic G-3 lifecycle. Integrating the adapter
   would resurrect dead statuses as a third parallel path, so it (and its two unit
   tests) were **deleted**; `docs/editable-lifecycle.md` updated to record the
   retirement.

5. **Activation gate dedup.** `updateVendorStatusWithGate` was prod-dead; the live
   gate was inline in `updateVendor` (a third copy in `bulkSetVendorStatus`). The
   check is now a single shared `assertVendorActivationAllowed(newStatus,
   currentStatus, latest)` helper that `updateVendor` routes through; the dead
   `updateVendorStatusWithGate` was deleted and its tests migrated to the live
   `updateVendor` path.

6. **Subprocessor data-residency fields.** The add-subprocessor form collected only
   `{subprocessorVendorId, purpose}`, though the route schema, `addSubprocessor`
   usecase, and `VendorRelationship` model already accept `dataTypes` + `country`.
   Added the two optional inputs so the 4th-party data-residency fields are
   reachable.

## Decisions

- **Delete, not integrate (adapter)** — it's built on retired statuses; resurrecting
  it would create a third lifecycle.
- **Relabel, not reconcile (filter)** — the DB filter genuinely can't match "latest"
  without denormalization that would corrupt the deliberately-assessment-based
  dashboard metric; an honest label beats a false "agreement".
- **Shared helper + delete (gate)** — one throw-gate implementation
  (`assertVendorActivationAllowed`), used by the live edit path; `bulkSetVendorStatus`
  keeps its collect-blocked-don't-throw shape but reuses `isActivationEligible`.
- **dataAccess as a span, not a badge** — the vendor page is at its badge-density
  budget; a localized span conveys the value without a new loud badge.
