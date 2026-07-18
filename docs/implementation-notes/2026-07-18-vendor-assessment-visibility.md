# 2026-07-18 — Vendor assessment lifecycle visibility (PR-S)

**Commit:** `<pending> fix(vendors): restore Assessments tab, surface in-flight assessments + resend, observable risk writeback with corrected idempotency, roll next-review on close (Prompt 1)`

## Design

Three visibility gaps across the vendor assessment lifecycle: the Assessments
tab was empty (regression), in-flight assessments were tracked nowhere, and the
auto-created register Risk was silent.

### 1. Empty Assessments tab (regression)

`Vendor.getById` includes only a `_count` for assessments — no full relation —
so the detail page's `setAssessments(v.assessments || [])` was always `[]`.
Rather than bloat the vendor payload for every consumer, a dedicated
`GET /vendors/[vendorId]/assessments` route (`listVendorAssessments`) returns the
table's rows with the template NAME resolved through `templateVersion` (G-3 rows
have `templateId=null`, so the legacy `template.name` was showing "—"). The tab
fetches it; the template column reads the pre-resolved `templateName`. Row
routing: SUBMITTED/REVIEWED/CLOSED → the review page; SENT/IN_PROGRESS → a muted
"Awaiting response" marker (they're actionable in the Outstanding section).

### 2. Surface in-flight (SENT/IN_PROGRESS) assessments + resend

The review queue excludes SENT/IN_PROGRESS. A new **"Outstanding — awaiting
response"** section on the tab lists them with template, respondent, and sent
date, plus a **Resend invite** action. Because the original share link is
unrecoverable (only its SHA-256 hash is stored), `resendAssessmentInvite` MINTS
A FRESH token (invalidating the old one), re-queues the invitation email, and
returns the new working link for the admin to reveal — the one-time link is no
longer the only artifact.

### 3. Observable risk writeback + corrected idempotency

`applyAssessmentRiskWriteback` now returns the id of the auto-created Risk;
`reviewAssessment` threads it into `ReviewAssessmentResult.autoCreatedRiskId`,
the review route returns it, and the review UI toasts a link to the created Risk.

The over-broad idempotency (skip if the vendor has ANY `RISK` link) meant a
single unrelated manual risk link suppressed assessment-sourced materialization
forever. Fixed by keying on an **`ASSESSMENT_SOURCED`** marker — a new
`VendorLinkRelation` value the writeback stamps on the link it creates. Skip only
when an `ASSESSMENT_SOURCED` RISK link already exists; unrelated manual links no
longer suppress.

### 4. Review-date behavior (decision)

A completed review sets `lastAssessmentReviewedAt` but never rolled
`Vendor.nextReviewAt`. **Decision: populate `nextReviewAt` on review completion**
from the reassessment cadence (365d) — but only when nothing is already scheduled
in the future, so a deliberately-set manual review date is preserved. The vendor's
"next review" now reflects the assessment cadence after a review, without clobbering
manual scheduling.

## Files

| File | Role |
| --- | --- |
| `prisma/schema/enums.prisma` + migration `20260718100000_*` | `ASSESSMENT_SOURCED` VendorLinkRelation value |
| `src/app-layer/usecases/vendor-assessment-review.ts` | `listVendorAssessments`; writeback idempotency marker + returns risk id + `nextReviewAt` roll; `autoCreatedRiskId` on the result |
| `src/app-layer/usecases/vendor-assessment-send.ts` | `resendAssessmentInvite` (fresh-token resend) |
| `src/app/api/t/.../vendors/[vendorId]/assessments/route.ts` (new) | Assessments-list endpoint |
| `src/app/api/t/.../vendor-assessment-reviews/[assessmentId]/resend/route.ts` (new) | Resend endpoint |
| `.../vendor-assessment-reviews/[assessmentId]/review/route.ts` | Returns `autoCreatedRiskId` |
| `src/app/t/.../vendors/[vendorId]/page.tsx` | Tab fetches the new route; template name; Outstanding section + resend; row routing |
| `.../vendor-assessment-reviews/[assessmentId]/VendorAssessmentReviewClient.tsx` | Auto-created-risk notice + link |

## Decisions

- **Dedicated list route, not a fatter getById** — the assessments payload is only
  needed by the tab; a lazy endpoint keeps the shared vendor payload lean.
- **Resend re-mints, not resends the old link** — the plaintext link is
  unrecoverable by design (hash-at-rest), so a working resend must issue a new
  token; this also invalidates a possibly-leaked old link.
- **Enum marker for idempotency** — the only non-fragile way to distinguish the
  writeback's own link from a manual one; a title/category heuristic would be
  brittle. `ASSESSMENT_SOURCED` is a small additive migration.
- **Populate nextReviewAt, guarded** — more useful than a label, and the future-date
  guard respects the deliberate manual/cadence split (`overdueReassessment` still
  keys off `lastAssessmentReviewedAt`).
