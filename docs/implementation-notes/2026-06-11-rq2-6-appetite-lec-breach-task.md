# 2026-06-11 — RQ2-6: appetite on the LEC + breach → remediation task

**Commit:** _(this commit)_ — appetite thresholds drawn on the loss curve; breaches spawn tasks

## Design

RQ-2 gave tenants a quantitative appetite (`RiskAppetiteConfig`) and
breach telemetry (`RiskAppetiteBreach`), but the thresholds lived
only on an admin form and breaches dead-ended in a history list.
Two closures:

**1. Appetite on the Loss Exceedance Curve.**
`<LossExceedanceCurve>` gains `referenceLines` — dashed vertical
markers with labels; the x-domain stretches to keep an off-chart
cap visible. The risk dashboard draws `singleRiskAleMax` as
"Per-risk appetite": on a per-risk LEC that line is a genuine
x-threshold (every step right of it is a risk outside appetite).
The portfolio ceiling is deliberately NOT drawn on the curve — it
is a Σ-constraint, and rendering it as a per-risk threshold would
lie. It gets an honest utilisation annotation under the chart
("Portfolio ALE $X of $Y ceiling (Z%)"). The ratchet pins this
distinction.

**2. Breach → remediation task.**
`createBreachRemediationTask(ctx, breachId)`:
  - refuses resolved/missing breaches;
  - derives the task content SERVER-side from the breach row
    (typed title per breach type, compact-currency amounts,
    HIGH priority, `source: 'risk_appetite_breach'`);
  - composes the canonical `createTask` + `addTaskLink` usecases
    (RISK link when the breach is risk-attributed);
  - claims the breach via conditional `updateMany`
    (`remediationTaskId: null` → task id) — one task per breach;
    a lost race returns the winner's task id instead of duplicating.
The admin breach list grows a "Create task" / "View task" pair;
`POST …/breaches/:id/remediation-task` accepts no body.

## Files

| File | Role |
| --- | --- |
| `prisma/schema/compliance.prisma` + migration `20260611120000_…` | `RiskAppetiteBreach.remediationTaskId` (soft reference) |
| `src/app-layer/usecases/risk-appetite.ts` | `createBreachRemediationTask` |
| `src/app/api/…/breaches/[id]/remediation-task/route.ts` | Body-less POST |
| `src/components/ui/charts/loss-exceedance-curve.tsx` | `referenceLines` support |
| `…/risks/dashboard/page.tsx` | Appetite fetch + LEC marker + ceiling annotation |
| `…/admin/risk-appetite/page.tsx` | Per-breach task actions |

## Decisions

- **Soft task reference.** `remediationTaskId` carries no FK —
  deleting the task leaves a dangling id the UI treats as "no task".
  Breach telemetry must never block task lifecycle, and the
  conditional-claim idempotency doesn't need referential integrity.
- **Server-derived task content.** A client-supplied title would let
  the audit trail drift from the breach row; the POST body is empty
  by contract (ratchet-pinned).
- **Portfolio ceiling stays off the curve.** The most tempting
  visual (one more dashed line) would misread as "risks right of
  this are the problem" when the constraint is the SUM.
- **`assertCanWrite`, not admin-only.** Spawning a remediation task
  is an editor-grade action; reconfiguring appetite stays admin.
