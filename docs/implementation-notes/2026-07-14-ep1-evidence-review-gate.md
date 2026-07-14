# 2026-07-14 — ep1: evidence approval as a load-bearing, consistent gate

**Commit:** `<pending> feat(evidence): make approval load-bearing (coverage predicate + SoD + reject reasons)`

## Design

Four independent seams had drifted so that "evidence approval" carried
almost no weight. This change makes approval the single hinge every
downstream signal turns on.

1. **One coverage predicate.** `src/lib/compliance/coverage-evidence.ts`
   is the sole definition of "evidence that counts toward framework
   coverage / audit readiness": APPROVED, not archived, not
   soft-deleted, unexpired. It ships two mirrored forms —
   `isCoverageQualifyingEvidence(e, now)` (in-memory) and
   `coverageQualifyingEvidenceWhere(now)` (a Prisma `where` fragment).
   All four scorer sites route through it: three in
   `audit-readiness-scoring.ts` (GENERIC / ISO27001 / NIS2 evidence
   dimensions) and one in `framework/coverage.ts` (the
   controls-missing-evidence gap). Before this, one site counted
   `status: { in: ['SUBMITTED', 'APPROVED'] }` and none checked expiry,
   so a merely-submitted or expired row silently satisfied a control.

2. **Segregation of duties.** A reviewer may not approve or reject
   evidence they authored. The submitter is resolved as the
   `reviewerId` of the latest `SUBMITTED` `EvidenceReview`, falling back
   to `Evidence.ownerUserId`. `reviewEvidence` throws `forbidden(...)`
   on self-review; `bulkApproveEvidence` skips the row.

3. **Bulk-approve is gated, not a bypass.** `bulkApproveEvidence` now
   mirrors `reviewEvidence`: reviewer tier (`assertCanAdmin`), only
   `SUBMITTED` rows are eligible, self-review rows are skipped, and each
   approved row records an `EvidenceReview`, a STATUS_CHANGE audit
   entry, and an owner notification (factored into the shared
   `notifyEvidenceOwner` helper). Its return shape is
   `{ approved, skipped, skippedNotSubmitted, skippedSelfReview }`.

4. **Real rejection reasons.** The list-row and detail-sheet reject
   affordances open a required-reason `<Modal>` (`RejectReasonModal`);
   the reason threads through to `EvidenceReview.comment` and the owner
   notification. The bulk-approve toast surfaces the skip breakdown.

## Files

| File | Role |
| --- | --- |
| `src/lib/compliance/coverage-evidence.ts` | New — the single coverage-evidence predicate (in-memory + Prisma `where`). |
| `src/app-layer/usecases/audit-readiness-scoring.ts` | Three evidence dimensions route through `coverageQualifyingEvidenceWhere`. |
| `src/app-layer/usecases/framework/coverage.ts` | Missing-evidence gap uses `isCoverageQualifyingEvidence`. |
| `src/app-layer/repositories/EvidenceRepository.ts` | New batched `getLatestSubmitters` (SoD source, no N+1). |
| `src/app-layer/usecases/evidence.ts` | SoD on `reviewEvidence`; gated `bulkApproveEvidence`; shared `notifyEvidenceOwner` + `resolveEvidenceSubmitter`. |
| `src/app/t/[tenantSlug]/(app)/evidence/RejectReasonModal.tsx` | New — required rejection-reason prompt, shared by list + sheet. |
| `src/app/t/[tenantSlug]/(app)/evidence/EvidenceClient.tsx` | Row reject opens the modal; bulk-approve toast surfaces skip counts. |
| `src/app/t/[tenantSlug]/(app)/evidence/EvidenceDetailSheet.tsx` | `onReview` widened to `(id, action, comment?)`; sheet reject opens the modal. |
| `messages/en.json`, `messages/bg.json` | `evidence.reject.*` + `evidence.list.bulkApproveResult`. |
| `tests/guards/coverage-evidence-predicate.test.ts` | New ratchet locking the predicate unification. |
| `tests/integration/evidence-review-gate.test.ts` | New behavioural coverage of the gate + SoD. |

## Decisions

- **Surprising column names.** The Evidence archive flag is the boolean
  `isArchived` (not `archivedAt`) and the expiry timestamp is `expiredAt`
  (not `expiresAt`); soft-delete is the separate `deletedAt`. The
  predicate keys on the real column names — a row is expired when
  `expiredAt` is set and in the past.
- **SoD is unconditional.** No per-tenant "allow self-review" setting
  exists anywhere in the schema, so self-review is refused for every
  tenant. A per-tenant override is a separate change if a tenant ever
  needs one.
- **Submitter resolution.** Latest `SUBMITTED` `EvidenceReview.reviewerId`
  wins; `Evidence.ownerUserId` is the fallback when no submission review
  exists. `getLatestSubmitters` is a single batched `findMany` reduced
  into a map — the bulk path stays free of per-row reads.
- **Ratchet invariant.** `coverage-evidence-predicate.test.ts` asserts
  both scorer files import the shared module and that neither (comments
  stripped) contains a `SUBMITTED` literal or a `status: { in: [`
  evidence filter — the canary for a re-inlined status set that would
  let un-approved evidence count again.
- **Reject modal shared across list + sheet.** One `RejectReasonModal`
  serves both surfaces; the sheet's `onReview` gained an optional
  `comment` so the reason reaches the existing optimistic-review
  pipeline unchanged.
