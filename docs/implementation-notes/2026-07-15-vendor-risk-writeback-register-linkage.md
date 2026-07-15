# 2026-07-15 — Vendor assessment → risk writeback + register linkage

**Commit:** `<pending> feat(vendors): close the assessment→risk→register loop`

## Design

Vendor risk was a well-instrumented island: an assessment produced a
`riskRating`, but nothing wrote it back to the `Vendor`, the activation gate
was unsatisfiable, and no vendor risk reached the Risk register. This closes
the loop.

- **Writeback.** `reviewAssessment` now, post-commit, stamps
  `Vendor.inherentRisk` (assessment-derived) + `Vendor.lastAssessmentReviewedAt`
  from the review's rating. Best-effort, outside the review transaction
  (mirrors the evidence-attach + notification pattern).
- **Register linkage.** On a HIGH/CRITICAL review, if the vendor has no
  existing `VendorLink(RISK)`, auto-create a register `Risk` + link it
  (`relation: RELATED`). Idempotent — a second review on the same vendor
  short-circuits on the existing link, so no duplicate risk.
- **Activation gate, made real + wired.** One predicate `isActivationEligible`
  (latest assessment is a COMPLETED review — REVIEWED/CLOSED/legacy-APPROVED —
  carrying a rating) gates `updateVendorStatusWithGate`, the **edit path**
  (`updateVendor` when `status→ACTIVE`), and **bulk** (`bulkSetVendorStatus`
  skips + reports ineligible vendors). The old gate keyed on APPROVED only
  (unsatisfiable for G-3) and had no route caller.
- **Reverse "where-used."** New `VendorLink @@index([tenantId, entityType,
  entityId])` + `listByEntity` + `listVendorsLinkedToEntity` + a
  `GET /vendors/linked` route back a shared `<LinkedVendorsPanel>` on the
  Risk / Control / Asset / Task detail pages. `listVendorLinks` now hydrates
  each link with its target's display name (batched per type) so the links
  tab renders named hyperlinks, not raw cuids.
- **Metric honesty.** `highRiskNoAssessment` now treats REVIEWED/CLOSED as
  assessed (was mis-counting G-3 vendors forever). `overdueReassessment` is a
  genuinely distinct metric (ACTIVE vendors never reviewed or >1y stale, via
  `lastAssessmentReviewedAt`) rather than an alias of `overdueReview`. The two
  dashboard risk distributions are relabeled ("Business criticality" — manual;
  "Assessment risk" — latest review) so they no longer read as contradictory.

## Files

| File | Role |
| --- | --- |
| `prisma/schema/vendor.prisma` + migration `20260715180000_…` | `Vendor.lastAssessmentReviewedAt`; VendorLink reverse index. |
| `usecases/vendor-assessment-review.ts` | Post-commit writeback + idempotent auto-risk. |
| `usecases/vendor.ts` | Gate helper + wiring (edit/bulk); `highRiskNoAssessment`/`overdueReassessment` fixes; hydrated `listVendorLinks`; `listVendorsLinkedToEntity`. |
| `repositories/VendorRepository.ts` | `VendorLinkRepository.listByEntity`. |
| `api/…/vendors/linked/route.ts` | Reverse where-used endpoint. |
| `components/LinkedVendorsPanel.tsx` + risk/control/asset/task detail pages | Reverse "Linked vendors" section. |
| `vendors/[vendorId]/page.tsx` | Named-hyperlink links tab; `residualRisk` editor; `inherentRisk` assessment-derived label. |
| `vendors/dashboard/page.tsx` | Relabeled risk distributions + distinct overdue tiles. |

## Decisions

- **inherentRisk = assessment-derived (read-only), residualRisk = manual
  (editable).** The assessment measures the vendor's posture → drives inherent;
  the reviewer's post-mitigation judgment stays manual.
- **Criticality remains the manual/authoritative business axis**; assessment
  rating is labeled "assessment-derived". They're different axes, not rivals —
  the fix is honest labeling, not collapsing them.
- **Auto-risk fires only on HIGH/CRITICAL, once per vendor** (guarded on any
  existing RISK link) — avoids register spam on every review.
- **Bulk activation is partial, not all-or-nothing** — eligible vendors
  activate, ineligible are returned in `blocked` rather than failing the batch.
