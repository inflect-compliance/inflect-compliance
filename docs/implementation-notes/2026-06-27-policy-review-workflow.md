# 2026-06-27 — Policy review workflow + evidence-to-retain linkage

**Commit:** `<sha> feat(policies): canonical template skeleton + review cadence + evidence-to-retain linkage`

Credit: the canonical section skeleton + the cadence/evidence content are adapted
from [`D4d0/ciso-toolkit`](https://github.com/D4d0/ciso-toolkit) (MIT). This PR
makes that content *operational* (review loop + navigable evidence) on top of the
Prompt-1 template library and Prompt-2 framework linkage.

## Design

The ciso-toolkit policies share a professional section skeleton. Two sections map
onto existing-but-disconnected IC capabilities; this PR wires them up:

- **"Document Control" → review cadence.** `parseReviewCadenceDays` reads the
  Document Control section (the gap between the version date and the stated "Next
  Review Date", snapped to a standard cadence; keyword fallback). On
  create-from-template it pre-fills `Policy.reviewFrequencyDays` + a first
  `nextReviewAt`. The daily `policy-review-reminder` job (already registered)
  now finds policies inside the tenant's `reminderDaysBefore` window (or overdue),
  emits the `POLICY_REVIEW_DUE` automation event, writes an immutable
  `POLICY_REVIEW_OVERDUE` audit row (overdue only), and notifies the owner.
  `markPolicyReviewed` stamps `lastReviewedAt` + recomputes `nextReviewAt`,
  closing the loop.
- **"Evidence to Retain" → evidence linkage.** `parseEvidenceToRetain` turns the
  bullet list into `PolicyEvidenceItem` checklist rows (label only) at creation.
  The detail page surfaces them; the tenant links each to a real `Evidence`
  record (`PATCH …/evidence-items/[itemId]`). The link makes the policy's
  operational proof navigable.
- **"Roles & RACI" → owner.** create-from-template defaults `ownerUserId` to the
  creating user (the tenant adjusts).

## Premise corrections (verified against the live schema)

- Policy **already had** `ownerUserId`, `reviewFrequencyDays`, `nextReviewAt`. The
  prompt proposed a new `reviewCadenceMonths` + `lastReviewedAt`; introducing a
  months column would have duplicated the existing day-based cadence. **Only
  `lastReviewedAt` was added** — the rest are reused.
- The `policy-review-reminder` job + its schedule + executor registration
  **already existed** (audit + automation only). This PR fleshed it out
  (reminder window + owner notification) rather than creating it.

## Decisions

- **Review ≠ approval.** `markPolicyReviewed` (periodic re-validation) is distinct
  from `PolicyApproval` (initial sign-off); they coexist. New audit action
  `POLICY_REVIEWED` (`status_change`), separate from the approval actions.
- **Skeleton lint is a warning, not a gate.** `lintPolicySkeleton` reports
  missing canonical sections; some policies legitimately omit sections. Parsing is
  best-effort — a missing/odd section yields null/[] rather than throwing.
- **Evidence linkage is best-effort + explicit.** Items are *suggested* from the
  template; the tenant links real evidence. Items aren't auto-created from
  evidence, and the `evidenceId` FK is `SetNull` on evidence delete (an unlinked
  item stays an open checklist entry).
- **`PolicyEvidenceItem` is a real tenant-scoped model** (canonical Class-A RLS),
  not JSON on Policy — so "which policies cite this evidence" stays queryable and
  the link is FK-integrity-checked.
- **Notification, not a forced task.** The job notifies the owner (deduped per
  day) + emits the automation event (so tenants can build their own task rules);
  an auto-created review Task was left out to avoid a per-policy dedupe read (N+1).

## Files

| File | Role |
|------|------|
| `src/lib/policy/template-skeleton.ts` | Canonical sections + `lintPolicySkeleton` + `parseReviewCadenceDays` / `parseEvidenceToRetain`. |
| `prisma/schema/compliance.prisma` | `Policy.lastReviewedAt` + `PolicyEvidenceItem` model. |
| `prisma/migrations/20260627170000_*` / `…170100_*` | Column + table + RLS; `POLICY_REVIEW_DUE` notification enum value. |
| `src/app-layer/usecases/policy.ts` | create-from-template pre-fill + evidence seed; `markPolicyReviewed`. |
| `src/app-layer/usecases/policy-evidence.ts` | list / add / link / unlink evidence items. |
| `src/app-layer/jobs/policyReviewReminder.ts` | reminder-window scan + owner notification (kept audit + automation). |
| `src/app/api/.../policies/[id]/review` + `…/evidence-items[/itemId]` | review + checklist routes. |
| `src/app/.../policies/[policyId]/page.tsx` + `PolicyEvidenceChecklist.tsx` | overdue tone + mark-reviewed + checklist UI. |
| `tests/guardrails/policy-review-workflow-coverage.test.ts` | structural + parser ratchet. |
