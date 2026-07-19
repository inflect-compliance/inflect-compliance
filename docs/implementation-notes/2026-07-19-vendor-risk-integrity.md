# 2026-07-19 — Vendor risk integrity: orphaned auto-Risks, frozen fields, and latest-assessment drift

**Commit:** `<pending>` fix(vendor): separate auto-Risk failure domains, unfreeze dataAccess, align latest-assessment ordering

## Design

Four low/medium residuals on an otherwise mature vendor surface. Three are
correctness; one is a decision recorded rather than code changed.

### 1. Auto-Risk creation — one try/catch, two failure domains

`applyAssessmentRiskWriteback` materialises a register Risk when a review lands
a HIGH/CRITICAL rating, then links it to the vendor with an
`ASSESSMENT_SOURCED` marker. Both steps shared a single `try/catch` that
returned `createdRiskId: null` on any throw.

That conflated two very different outcomes. If `createRisk` throws, nothing was
persisted and `null` is accurate. But if only `addVendorLink` throws, the Risk
row is **already committed** — and reporting `null` meant:

- the reviewer was never told a Risk had been created,
- the Risk sat in the register unlinked from the vendor that caused it,
- and the `ASSESSMENT_SOURCED` idempotency marker was missing, so the *next*
  review would happily materialise a **duplicate**.

The two steps are now separate domains. Creation failure still returns `null`.
Link failure returns the committed `createdRiskId` plus `linkFailed: true`, and
logs at `error` — the severity matters, because this state needs manual
reconciliation and silently degrades into duplicate risks.

**Why not one transaction.** `createRisk` and `addVendorLink` are distinct
usecases that each open their own tenant context. Making them atomic would mean
reaching past the usecase layer into repositories, inverting the layering the
codebase enforces elsewhere. The failure-domain split satisfies the actual
invariant — *a created Risk is never silently unlinked AND unreported* — without
that violation. True atomicity would need a dedicated usecase owning both
writes in one `runInTenantContext`; worth doing if this path ever grows a third
effect, but not worth restructuring two stable usecases for today.

### 2. `dataAccess` was frozen at creation; `inherentRisk` is read-only by design

`UpdateVendorSchema` accepts `dataAccess`, `VendorRepository.update` persists
it, and the create form offers it — but the detail edit-form state omitted it,
so it could never be changed after creation. Now wired: form state, hydration,
PUT body (empty string → `null`, matching the `residualRisk` contract), and a
`Combobox` reusing the existing `DATA_ACCESS_LABEL_KEY` map so edit and create
offer identical localized options.

`inherentRisk` was deliberately **not** made editable. Every assessment review
overwrites it (`applyAssessmentRiskWriteback` writes
`inherentRisk: riskRating`). An editable control would accept a value the next
review silently discards — a worse experience than no control at all. It now
renders read-only with a note pointing at the real mechanism.

### 3. Latest-assessment ordering drift

`listVendorAssessments` ordered by `startedAt desc`; the activation gate,
`getVendorMetrics`, and the dashboard risk buckets all define "latest" as
`orderBy createdAt desc take 1`. Those disagree whenever `startedAt` is null or
set later than row creation — so the assessment shown at the top of the detail
list was not necessarily the one the gate was reasoning about, on exactly the
screen where someone checks *why* a vendor is blocked. Aligned to `createdAt`.

### 4. `riskRating` filter vs dashboard — decision: keep the disclosed relabel

The list filter matches **any** historical assessment
(`assessments: { some: { riskRating } }`); the dashboard buckets by the latest
only. The considered alternative was denormalising `latestRiskRating` onto
`Vendor`, maintained on review writeback, and filtering on that.

Kept the disclosed relabel, because:

- The disclosure is real, not a fig leaf: the filter is labelled "Ever rated"
  and its description states outright that the dashboard buckets by the latest
  assessment. Both strings are already translated in `en` and `bg`.
- Denormalising adds a **silent drift surface**. Every path that creates,
  edits, deletes, or imports an assessment would have to maintain the column,
  and a stale denormalised value mis-filters *quietly* — strictly worse than a
  correctly-labelled "ever" semantic.
- It would need a migration, a backfill, an index, and retention /
  schema-index guardrail entries — disproportionate to a filter-semantics
  residual on a mature surface.

**Residual, stated plainly:** there is still no "currently rated HIGH" filter.
If that is wanted, the denormalised column is the right way to get it, and it
should be scoped as its own change with the drift-maintenance burden accepted
up front — not smuggled in as a relabel.

## Files

| File | Role |
| --- | --- |
| `src/app-layer/usecases/vendor-assessment-review.ts` | Failure-domain split + `linkFailed`; corrected module doc; `listVendorAssessments` ordering |
| `src/app/t/[tenantSlug]/(app)/vendors/[vendorId]/page.tsx` | `dataAccess` edit control + state/hydration/PUT; read-only `inherentRisk`; corrected `entityName` comment |
| `messages/{en,bg}.json` | `vendors.detail.inherentRiskReadOnly` |
| `tests/unit/vendor-assessment-risk-writeback.test.ts` | Pins the failure-domain invariant |

## Decisions

- **Link failure logs at `error`, not `warn`.** It leaves state requiring
  manual reconciliation and degrades into duplicate risks on the next review. A
  `warn` would be lost in the noise.
- **`linkFailed` is optional on the return type**, so existing callers reading
  only `createdRiskId` are unaffected.
- **The corrected module doc records a real absence.** It claimed a reviewer
  could return to a REVIEWED assessment and see the total recompute;
  `reviewAssessment` rejects anything not SUBMITTED, so that was never
  reachable. Rather than delete the sentence, the doc now states that review is
  single-shot and that in-place amendment would need an explicit
  REVIEWED → SUBMITTED reopen verb with its own authz and audit action — not a
  relaxation of the status guard, which is also what stops the risk writeback
  from firing twice.
- **The `entityName` fallback stays.** The comment claimed it was a placeholder
  "until the backend lands"; the backend *does* resolve it
  (`listVendorLinks` batch-loads names). But it remains nullable for targets
  that no longer resolve, so the raw-id fallback is still correct — the comment
  was wrong about the reason, not about the need.
