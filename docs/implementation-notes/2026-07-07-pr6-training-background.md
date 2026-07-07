# 2026-07-07 — PR-6: Security-awareness training + background checks

**Commit:** _(pending)_ `feat(personnel): training assignments + background checks + posture checks`

## Design

Completes the people-layer triad (PR-4 personnel, PR-5 devices, PR-6 training/
background). Manual entry stands alone; provider connectors are optional.

```
manual entry ──► TrainingCourse / TrainingAssignment / BackgroundCheck
                        │
data ──runTrainingCheck──► CheckResult (training provider, automation-runner)
```

- **Models** (compliance.prisma, RLS): `TrainingCourse` (`@@unique([tenantId, name])`,
  `cadenceDays`), `TrainingAssignment` (employee + course FKs, status), `BackgroundCheck`
  (`resultSummary` **encrypted at rest** via the Epic B manifest — it can quote
  adverse-action detail).
- **Checks** `runTrainingCheck` (pure) — `training_completed_annually` (overdue OR
  past-due OR completed-but-stale-beyond-cadence → fail) and `background_check_complete`
  (CLEAR → pass, else fail). The internal `training` provider queries scoped to tenantId.
- **Usecases** (tenant-scoped, `personnel` permission): `createTrainingCourse`,
  `assignTraining`, `completeTrainingAssignment`, `recordBackgroundCheck`,
  `listTrainingAssignments`, `listBackgroundChecks`. All manual — no provider required.
- **UI** `/training` list (EntityListPage + status filter). Routes: `training`
  (list/assign), `training/courses` (create), `training/[id]/complete`,
  `background-checks` (list/record).

## Scope

- **Provider connectors (KnowBe4 / Certn) deferred** — manual/API entry stands alone
  (the roadmap's requirement); a sync provider is the proven Okta/BambooHR pattern.
- **Overdue reminder job deferred** — the `OVERDUE` status + `training_completed_annually`
  check already surface overdue training; an email reminder (clone of
  `policyReviewReminder`) is a clean follow-up.
- **Background-check management UI deferred** — recorded via API; `listBackgroundChecks`
  deliberately omits `resultSummary` from its projection (sensitive).

## Decisions

- **`resultSummary` encrypted, and omitted from list projections.** Two layers: Epic B
  field-encryption at rest + never selecting it into a list DTO. Only a
  detail/single read (future) decrypts it.
- **Training staleness is cadence-driven.** A COMPLETED assignment older than the
  course's `cadenceDays` (default 365) fails `training_completed_annually` — annual
  training that lapsed is a gap, not a pass.
- **Reused PR-4's `personnel` permission** (people layer) — no new permission domain.
