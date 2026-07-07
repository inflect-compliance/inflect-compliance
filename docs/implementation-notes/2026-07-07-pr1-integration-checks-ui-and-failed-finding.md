# 2026-07-07 — PR-1 remaining surface: integration checks UI + FAILED→Finding + evidence-type fix

**Commit:** _(pending)_ `fix(integrations): control checks tab + FAILED→Finding loop + evidence-type`

## Context

The keystone PR-1 (integration bootstrap wiring + `automation-runner`) already
shipped on this branch. This closes its three remaining sub-scope items. Two of
the three were re-baselined against `main` (the roadmap targeted a divergent
branch):

- The evidence-type fix was **already done in one of two writers**
  (`usecases/integrations.ts` mapped to `EvidenceType.TEXT`); only the
  cron writer (`automation-runner.ts`) still cast `as EvidenceType`.
- `listExecutionsForControl` already existed but had **zero UI consumers**.

## Design

**1. FAILED → Finding (the failing-check loop).**
`automation-runner.executeControlAutomation` now calls a fail-safe
`reconcileFindingForCheck(control, status, result, now)` after committing the
execution + evidence:

- **FAILED** → open a de-duplicated `Finding` tagged
  `sourceKind='INTEGRATION_CHECK'`, `sourceRef='<controlId>:<automationKey>'`,
  linked via `controlId`. Dedup is a `findFirst` on the
  `Finding[tenantId, sourceKind, sourceRef]` index (still-open only) — re-runs
  never pile up duplicates. This mirrors the existing scanner-ingestion / NIS2
  materializer contract.
- **PASSED** → reconcile: `updateMany` closes any still-open finding for that
  source, so a recovered check clears its finding.
- **ERROR** → neither (the check couldn't run; not a compliance failure).
- Fully fail-safe: the execution + evidence are already committed, so any
  finding-side error is logged and swallowed, never thrown into the run.

It uses raw `prisma` (not `createFinding(ctx, …)`) because the runner is a
scheduled job with no `RequestContext`/user actor; the finding's provenance is
carried by `sourceKind`/`sourceRef` and the `IntegrationExecution` row is the
audit trail. Title/description are system-generated (no user free-text), so the
usecase's sanitisation is moot here.

**2. Evidence-type fix.** `automation-runner.ts` now maps to
`EvidenceType.TEXT` explicitly (matching the usecase writer), removing the
`as EvidenceType` cast. Integration evidence is always a text summary of a
check result, so TEXT is correct.

**3. Checks tab.** New `GET /api/t/[slug]/controls/[controlId]/executions`
(→ `listExecutionsForControl`, `controls.view`) backs a new self-fetching
`ControlChecksTab` on the control detail page: latest status card + a history
`DataTable` (check, status, result summary, last-run, trigger). Lazy SWR key —
nothing loads until the tab opens.

## Files

| File | Role |
| --- | --- |
| `src/app-layer/jobs/automation-runner.ts` | `reconcileFindingForCheck` + evidence-type fix; exports `INTEGRATION_CHECK_SOURCE_KIND` |
| `src/app/api/t/[tenantSlug]/controls/[controlId]/executions/route.ts` | new read route for the checks tab |
| `src/app/t/[tenantSlug]/(app)/controls/[controlId]/_tabs/ControlChecksTab.tsx` | checks tab UI |
| `src/app/t/[tenantSlug]/(app)/controls/[controlId]/page.tsx` | wire the `checks` tab |
| `src/lib/swr-keys.ts` | `controls.executions(id)` cache key |
| `messages/{en,bg}.json` | `detailPage.tabChecks` + `checksTab.*` |
| `tests/unit/automation-runner-branches.test.ts` | FAILED→Finding, dedup, reconcile, fail-safe, evidence-type TEXT |
| `tests/guardrails/integration-evidence-type-pinning.test.ts` | ratchet: both writers map TEXT, no `evidencePayload.type as` cast |

## Decisions

- **Dedup on `(controlId, automationKey)`, not per-execution** — one open
  finding per failing check, reconciled closed on recovery. Avoids a finding
  per cron tick.
- **Raw prisma over the usecase** in the runner — no user context in a
  scheduled job; provenance via `sourceKind`/`sourceRef` + the execution row.
- **Reconcile-on-pass included** even though the roadmap only asked for
  open-on-FAILED — it's the same materializer contract and prevents stale
  findings lingering after a check recovers.
