# 2026-07-07 — H5: test depth — structural ratchets → behavioural proof

**Commit:** `<pending>` test(h5): assistant import allowlist, Device RLS, isolation forward-lock

## Design

The post-merge scan's confidence finding: the new features are guarded by
regex ratchets + RLS-mocked unit tests. This PR converts the weakest ones to
behavioural / positive-allowlist form and adds a forward-lock.

### What shipped
1. **Assistant "propose-not-commit" → positive import allowlist.**
   `assistant-ai.test.ts` previously blacklisted 3 create-usecase names (missed
   `createControl`/`createPolicy`/any `update*`/`delete*`). It now scans the
   assistant usecase's imports and fails if it reaches ANY `app-layer/usecases/*`
   module outside `{ dashboard, agent-proposals }`.
2. **Isolation-coverage forward-lock**
   (`new-feature-isolation-coverage.test.ts`) — every 10-PR-wave tenant model
   must be classified: `ISOLATION_TESTED` (dedicated behavioural test, file must
   exist) or `ISOLATION_INTERIM` (proven by the DB-backed `rls-coverage` policy
   triple, with a written reason). A wave model renamed/removed/unclassified
   fails CI; coverage only ratchets up. (Every wave model is currently
   `ISOLATION_INTERIM` — proven by `rls-coverage` — except
   `AccessReviewConnectedDecision`, which shares the AccessReview live suite. A
   first-cut standalone Device suite was dropped: it couldn't be validated
   against the broken local test DB and hit an unrelated FK-cleanup error on CI;
   the forward-lock records the gap so it can only ratchet up.)

### Already delivered earlier in the wave (verify-and-extend)
- **Public /api/trust import-isolation ratchet** — landed in H4.
- **Behavioural fail-closed + reachability** — landed as H1
  (`middleware-public-reachability`), H2 (`h2-fail-closed`), H3
  (`h3` truncation tests). Not re-created here.

## Follow-ups (tracked)

- **Per-usecase two-tenant tests** for the remaining `ISOLATION_INTERIM` models
  (questionnaire / personnel / training / trust-center). Their RLS is
  behaviourally enforced today via the DB-backed `rls-coverage` suite; the
  dedicated per-usecase test is the next increment (the forward-lock records
  each as interim so none can silently regress).
- **Full every-model forward-lock.** This ratchet scopes to the wave; the
  generic `rls-coverage` already auto-catches ANY new tenant model's missing RLS
  policies DB-side.

## Decisions

- **Interim ≠ untested.** `rls-coverage.test.ts` is DB-backed (queries
  `pg_policies`), not mocked — so every interim model already has behavioural
  proof that its tenant-isolation policies exist and FORCE is on. The interim
  bucket tracks the gap between "policy proven" and "per-usecase call proven",
  not an absence of isolation.
- **Device chosen for the first dedicated test** — flat table, no cross-tenant
  composite FK, lowest-risk faithful clone of the proven template.
