# 2026-06-23 — Coverage Wave B

**Commit:** `<pending> test: coverage wave B — jobs, repositories, audit writers, mailer, backend usecases/services/lib`

## CRITICAL — loaded-files vs enforcement-universe (read this first)

The CI coverage gate enforces over the **entire `collectCoverageFrom`
universe** — every matched source file, INCLUDING files no test ever
imports (counted as 0%). There are **two different numbers** and only
one is authoritative:

| Source | Branches | What it counts | Use it? |
|--------|----------|----------------|---------|
| `coverage/coverage-summary.json` → `total` | ~21,100 total, **~69.3%** | Only files a test LOADED | ❌ MISLEADING |
| The `--coverageThreshold` gate (`Jest: Coverage for … does not meet`) | ~23,400 total, **62.54%** | The FULL `collectCoverageFrom` universe (never-loaded files = 0%) | ✅ AUTHORITATIVE |

The ~2,300-branch gap between the two IS the never-loaded files. The
ONLY way to read the true global is to run the exact gate command and
read the `Jest: Coverage for branches (X%) does not meet "global"
threshold` message — it only prints on failure, so temporarily set a
deliberately-high threshold to surface the real number. Do NOT read it
off `coverage-summary.json`'s `total`, which overstates by ~7pp.

**The first Wave B batch mis-cited the 69.28% `summary.json` total as
"global 68 / measured 69.28" and set `jest.thresholds.json` global
branches accordingly — that number was loaded-only.** The honest
enforcement baseline at that point was **62.13%** branches.

### Enforcement-global branch trajectory (authoritative)

`56` (pre-Wave-B) → `62.13` (batch 1) → **`62.54`** (batch 2). Final
enforcement globals: branches **62.54**, functions **62.09**, lines
**77.14**, statements **75.63**.

**The ≥65 goal was NOT met and is deferred to a dedicated UI-testing
wave.** It was calibrated against the misleading loaded-only ~69%. Batch
2 added 13 backend files for only **+0.4pp** (62.13 → 62.54) — the
testable backend pool is essentially exhausted. Reaching a true ≥65
(~580 more covered branches) requires testing the React UI/page surface
(`src/app` + `src/components`), which is mostly at 0% and yields few
branches per file. Wave B ships at an honest, gate-passing floor.

## Design

Wave B adds real, branch-exercising tests for previously-zero-coverage
files, then ratchets `jest.thresholds.json` up to the enforcement actual
(minus a small margin). Global floors went from the original 56/54/70/69
to **62/61/76/75** (branches/functions/lines/statements). Every test
drives REAL branches against the REAL entity models — no synthetic
stubs:

### This batch — never-loaded backend files (the highest-ROI lever)

The biggest enforcement-coverage gains come from files NO test loaded
(each at 0% in the enforcement universe). This batch added tests for 13
of them:

| Target (`src/…`) | Test | Style |
|------|------|-------|
| `app-layer/usecases/test-hardening.ts` | `tests/integration/test-hardening-usecase.test.ts` | DB-backed (runInTenantContext via singleton) |
| `lib/stripe.ts` | `tests/unit/lib/stripe.test.ts` | unit (mock `stripe` SDK + prisma) |
| `app-layer/jobs/compliance-digest.ts` | `tests/unit/jobs/compliance-digest.test.ts` | pure render + DB-backed loop (StubEmailProvider) |
| `app-layer/services/library-importer.ts` | `tests/integration/library-importer-service.test.ts` | DB-backed (synthetic LoadedLibrary; global Framework table) |
| `lib/controls/control-taxonomy.ts` | `tests/unit/lib/control-taxonomy.test.ts` | pure |
| `lib/number-format.ts` | `tests/unit/lib/number-format.test.ts` | pure |
| `app-layer/usecases/traceability-graph.ts` | `tests/integration/traceability-graph-usecase.test.ts` | DB-backed |
| `app-layer/usecases/inherited-control-data.ts` | `tests/integration/inherited-control-data-usecase.test.ts` | DB-backed |
| `app-layer/usecases/org-audit.ts` | `tests/unit/usecases/org-audit.test.ts` | unit (mock prisma, real pagination util) |
| `app-layer/jobs/report-delivery-jobs.ts` | `tests/unit/jobs/report-delivery-jobs.test.ts` | unit (mock prisma + risk-report usecases) |
| `app-layer/jobs/sharepoint-policy-jobs.ts` | `tests/unit/jobs/sharepoint-policy-jobs.test.ts` | unit (mock prisma + SharePoint client) |
| `app-layer/jobs/register-schedules.ts` | `tests/unit/jobs/register-schedules.test.ts` | pure (fake BullMQ Queue) |
| `app-layer/notifications/processOutbox.ts` | `tests/integration/processOutbox-usecase.test.ts` | DB-backed (controllable email provider) |
| `app-layer/repositories/ClauseRepository.ts` | `tests/integration/repositories/clause-repository.test.ts` | DB-backed (withTenantDb; Clause global, ClauseProgress tenant-scoped) |

DB-backed usecases that go through `runInTenantContext` were tested by
seeding via a directly-constructed `PrismaClient` (on `DB_URL`) and then
calling the usecase, which hits the same test DB through the
`@/lib/prisma` singleton because the gate command sets `DATABASE_URL` to
the test DB. No `customPrisma` injection needed.

### First batch (already on this branch)

- **Jobs** (`tests/unit/jobs/`) — the four target jobs export plain async
  executors (options-object signature), not BullMQ `Job`-wrapped handlers,
  so no queue boundary needed mocking. Tests seed real rows via
  `prismaTestClient()` and assert DB effects + return values:
  - `data-lifecycle.ts` — `purgeSoftDeletedOlderThan` /
    `purgeExpiredEvidenceOlderThan` / `runRetentionSweep`. The job's
    injectable `db` option is wrapped with `withSoftDeleteExtension`
    (the bare test client lacks the soft-delete extension that the
    production `@/lib/prisma` singleton wires, so `withDeleted()`'s magic
    key would otherwise leak to Prisma).
  - `retention.ts` — `runEvidenceRetentionSweep` archival branches
    (empty / dryRun / fresh-expiry / idempotent-already-expired).
  - `retention-notifications.ts` — reminder-task creation, owner-fallback
    chain, skip-no-actor, idempotent-duplicate, notifications-disabled
    suppression, already-expired trigger pass.
  - `tenant-dek-rotation.ts` — executor BRANCHES the existing
    `tests/integration/tenant-dek-rotation.test.ts` doesn't cover: noop
    (previousEncryptedDek already null), no-onProgress short-circuit,
    idempotent skip (rows already under the new DEK), batchSize clamp.
- **Repositories** (`tests/integration/repositories/`) — happy-path +
  RLS-rejection (mirrors `access-review-rls.test.ts`) for each public
  method. `Framework`/`FrameworkRequirement`/`FrameworkPack` are GLOBAL
  shared-catalog tables (no `tenantId`, no RLS — verified against the live
  schema), so FrameworkRepository has no cross-tenant RLS test; its
  tenant boundary lives in `getCoverage`/`isPackInstalled` which filter
  mappings/controls by tenantId — both are tested.
- **Audit writers** (`tests/unit/audit/`) — DB-backed (the per-tenant /
  per-org advisory lock, the hash chain, and the immutability trigger only
  exist on a real Postgres). Genesis (`previousHash=null`) → chain link,
  legacy-text vs structured `detailsJson`, metadata persistence, chain
  verification (valid / empty / tampered), and UPDATE/DELETE blocked with
  `IMMUTABLE_AUDIT_LOG` / `IMMUTABLE_ORG_AUDIT_LOG`.
- **Mailer** (`tests/unit/mailer.test.ts`) — nodemailer mocked at the
  module boundary; provider strategy + transport selection (secure port
  465 vs 587, auth present/omitted), send field permutations, the lazy
  env-init guard, and `initMailerFromEnv` configured-vs-fallback.

## Files

| File | Role |
|------|------|
| `tests/unit/jobs/data-lifecycle.test.ts` | covers `src/app-layer/jobs/data-lifecycle.ts` |
| `tests/unit/jobs/tenant-dek-rotation.test.ts` | covers executor branches of `src/app-layer/jobs/tenant-dek-rotation.ts` |
| `tests/unit/jobs/retention-notifications.test.ts` | covers `src/app-layer/jobs/retention-notifications.ts` |
| `tests/unit/jobs/retention.test.ts` | covers `src/app-layer/jobs/retention.ts` |
| `tests/integration/repositories/SsoConfigRepository.test.ts` | covers `src/app-layer/repositories/SsoConfigRepository.ts` |
| `tests/integration/repositories/OnboardingRepository.test.ts` | covers `src/app-layer/repositories/OnboardingRepository.ts` |
| `tests/integration/repositories/FileRepository.test.ts` | covers `src/app-layer/repositories/FileRepository.ts` |
| `tests/integration/repositories/FrameworkRepository.test.ts` | covers `src/app-layer/repositories/FrameworkRepository.ts` |
| `tests/unit/audit/audit-writer.test.ts` | covers `src/lib/audit/audit-writer.ts` |
| `tests/unit/audit/org-audit-writer.test.ts` | covers `src/lib/audit/org-audit-writer.ts` |
| `tests/unit/mailer.test.ts` | covers `src/lib/mailer.ts` |

## Decisions

- **Threshold correction.** `jest.thresholds.json` global was set from
  the loaded-only `summary.json` total in the first batch (and again,
  erroneously, in a draft of this batch). Every global is now re-derived
  from the authoritative enforcement universe (the `--coverageThreshold`
  gate's `does not meet` lines): branches **62**, functions **61**,
  lines **76**, statements **75** — each ≤ the enforcement actual
  (62.54 / 62.09 / 77.14 / 75.63) and up from the original 56/54/70/69.
  The **≥65 branch goal was NOT reached** (enforcement is 62.54) and is
  deferred to a UI-testing wave. Per-cohort floors
  (`usecases`/`policies`/`events`/`lib`) were LEFT as set in batch 1:
  they already passed the gate, and the loaded-only `summary.json`
  cannot size their full-universe actuals, so raising them blind risks
  exceeding the enforcement actual (which fails CI). New tests only
  RAISE coverage, so the existing floors stay valid.
- **No `src/` changes.** No genuine bug surfaced in any target file.
- **`tenant-dek-rotation`'s `throw new Error('tenant not found')` is
  effectively unreachable on a real DB** — the `TENANT_DEK_ROTATION_STARTED`
  audit write happens first and `AuditLog.tenantId` FKs to Tenant
  (`ON DELETE RESTRICT`), so a missing tenant rejects at the audit insert.
  The test asserts the job rejects (not the specific message) and
  documents the dead branch.
- **Threshold bumps follow the actual-minus-1 rule** — see the Stage row
  added to `docs/coverage-policy.md` for the measured numbers. Never set
  a threshold above measured (CI fails) and never lower an existing floor.
