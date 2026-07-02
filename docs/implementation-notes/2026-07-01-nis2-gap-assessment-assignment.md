# 2026-07-01 — NIS2 gap-assessment multi-respondent async collection (Prompt 2)

**Commit:** `<pending> feat(audits): NIS2 gap-assessment multi-respondent delegation`

## Design

NIS2 accountability is cross-functional — scoping is a CEO answer, cryptography
IT, training HR, supply chain Procurement. The shared bank already tags every
question with `respondent`, so a STANDALONE re-assessment can be **partitioned**
into disjoint per-role buckets and routed to the member who can answer each part.

```
STANDALONE run ──dispatch──▶ Nis2GapAssignment × role (disjoint questionIds)
                              │  task + notification per assignee
   assignee opens /audits/nis2-gap/respond/[assignmentId]
                              │  submits ONLY their bucket
   answers ─────────────────▶ Nis2SelfAssessmentAnswer (parent, single source)
   owner ──finalize──▶ run COMPLETED + readiness snapshot
                       └─ propose-not-commit review stays approval-gated (Prompt 1)
```

## Decisions

- **Disjoint partition removes merge conflicts.** The union of all assignments'
  `questionIds` is exactly the 116 ids, with no overlap — enforced at dispatch
  (`assertDisjointCover`) and asserted in the ratchet against the real bank. Each
  member owns a distinct subset, so "write only my questions" is safe.
- **Answers stay on the normalized parent table — no `answersJson`.** The Prompt 1
  store is `Nis2SelfAssessmentAnswer`, one row per `(assessment, question)`
  (unique). Disjoint buckets therefore write **different rows**, so concurrent
  submits can't clobber each other — no JSON-blob read-modify-write merge is
  needed. `Nis2GapAssignment` only records WHICH ids a member owns; it never
  copies answers. (This departs from the prompt's `answersJson` sketch, which
  assumed a blob; the normalized table the feature already had is strictly
  better for concurrency.)
- **Data-layer authorization.** `submitAssignmentAnswers` rejects any questionId
  outside the caller's bucket, checked against the assignment row in the usecase
  — not the client. An HR assignee cannot write a Cryptography answer with a
  crafted payload. The assignee routes are ctx-scoped (assignee-or-admin).
- **Baseline is never delegated.** Dispatch rejects a `WIZARD_BASELINE` run — the
  admin answers the onboarding baseline once. Delegation is STANDALONE-only.
- **Dispatch tasks are a legitimate non-propose write.** Propose-not-commit
  (risks/controls) stays confined to Prompt 1's approval-gated apply path;
  `finalizeAssessment` only completes + snapshots. Dispatch creating a
  `task.createTask` per assignee (with audit) is ordinary work-routing, not a
  propose-not-commit breach — called out here so it isn't mistaken for one.
- **Force-finalize / partial-as-NA.** The owner can finalize before every
  assignment is SUBMITTED; unanswered questions are simply excluded from scoring
  (the scorer already excludes NA/unanswered), i.e. treated as NA.
- **Route shape.** Owner actions (dispatch/list/finalize) live under
  `/gap-assessments/[id]/assignments` and are `requirePermission('admin.manage')`
  + registered in `route-permissions.ts`. The assignee self-service routes live
  at top-level `/gap-assignments/[assignmentId]` (+`/submit`) because the
  assignee only ever holds an assignment id, not the assessment id.

## Files
| File | Role |
| --- | --- |
| `prisma/schema/compliance.prisma` | `Nis2GapAssignment` model (+ back-relations) |
| `prisma/migrations/20260702100000_nis2_gap_assignment/` | table + indexes + unique + RLS |
| `src/app-layer/usecases/gap-assessment-assignment.ts` | partition, dispatch, submit (authz), finalize |
| `src/app-layer/schemas/gap-assessment-assignment.ts` | request validation |
| `src/app/api/t/[tenantSlug]/gap-assessments/[id]/assignments/**` | owner dispatch/list/finalize |
| `src/app/api/t/[tenantSlug]/gap-assignments/[assignmentId]/**` | assignee get/submit |
| `src/app/t/[tenantSlug]/(app)/audits/nis2-gap/Nis2GapLifecycleClient.tsx` | owner Assignments panel |
| `src/app/t/[tenantSlug]/(app)/audits/nis2-gap/respond/[assignmentId]/**` | assignee answer page |
