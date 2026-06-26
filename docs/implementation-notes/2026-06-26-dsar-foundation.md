# 2026-06-26 — DSAR foundation (Stage 1)

**Commit:** `feat(dsar): data subject access request workflow (foundation)`

## Design

Stage 1 of a multi-PR DSAR sequence (GDPR Art. 15 export / Art. 17 erasure):
the `DataSubjectRequest` model + migration, the dependency-free decision core
(`src/lib/dsar.ts`), the export/erasure job skeletons carrying their contracts +
safety guards (NOT executing), docs, and a ratchet that locks the safety
invariants for every later stage. Full sequence + scope split in `docs/dsar.md`.

## Decisions

- **Pseudonymization, not deletion, for the audit trail.** Erasure sets
  `AuditLog.userId = NULL`, not DELETE — deletion breaks the hash chain and is
  refused by the `IMMUTABLE_AUDIT_LOG` trigger. GDPR Art. 17(3)(b) (processing
  necessary for a legal obligation — the audit trail itself) is the lawful basis
  to retain the *action* while erasing the *actor's identity*. The narrow trigger
  change that permits this one UPDATE path is deferred to the Stage 3 erasure PR.

- **24h cooling-off before erasure.** Irreversible deletion does not fire until
  24h after `VERIFIED` (`coolingOffElapsed()` + `DSAR_COOLING_OFF_HOURS`), with a
  cancel window. Email-click alone is too thin for irreversible deletion; Stage 3
  adds password + MFA step-up too.

- **`DataSubjectRequest` is user-scoped — no `tenantId` (deviation from brief).**
  A DSAR concerns a person's data across the whole platform. Adding a `tenantId`
  column would (correctly) pull the table into the RLS-coverage requirement
  (tenant_isolation + superuser_bypass + FORCE RLS), which I can't validate
  without a live DB. Cross-tenant by nature → the relevant tenants are derived
  from the user's memberships at execution time. Documented in `docs/dsar.md`.

- **Skeletons, not stubs-that-run.** The two job files exist (the ratchet requires
  them + their safety guards) but throw and are NOT registered with the scheduler
  — "no execution yet" per the brief's Week 1. Execution lands in Stages 2/3.

- **Migration validated without a DB.** `migrate dev` is harness-blocked; the
  migration SQL is Prisma's own `migrate diff --script` output (CREATE TYPE ×2 +
  CREATE TABLE + 2 indexes + FK `ON DELETE RESTRICT`).

## Multi-PR sequencing

Stage 1 (this PR — foundation) → Stage 2 (export pipeline, reversible) → Stage 3
(erasure cascade + `IMMUTABLE_AUDIT_LOG` trigger change, irreversible, staging-
validated behind a flag) → Stage 4 (admin UI + monitoring + production rollout).
Each carries the `dsar` prefix; the ratchet ensures each merged PR preserves the
foundation's safety invariants.

## Deferred (NOT in Stage 1)

The interactive intake (HTTP route + verification email), export execution,
erasure execution + the audit-trigger migration, the `admin.compliance_dsar`
admin UI, and GDPR-deadline alerting — all enumerated in `docs/dsar.md`.
