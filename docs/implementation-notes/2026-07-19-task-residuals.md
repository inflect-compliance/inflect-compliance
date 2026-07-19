# 2026-07-19 — Task-surface residuals (PR-BB)

**Commit:** `<sha> chore(tasks): confirm the NIS2 reconcile skip, notify watchers on material edits, surface evidence-linked tasks, trim dead metrics`

## Design

Four lower-severity residuals on the task surface. Two were "decide and note"
questions; both decisions are recorded here with the evidence behind them.

### 1 — NIS2 plain-CONTROL_GAP reconcile: CONFIRMED as-is
NIS2 gap-lifecycle remediations (CONTROL_CREATE / plain-TASK) spawn tasks with
`type: 'CONTROL_GAP'` and `controlId: null`. `reconcileTaskSource` skips them,
so closing one reflects nothing back to the self-assessment.

**Decision: this is correct; leave it.** The gap self-assessment *answer* is the
source of truth. These tasks are nudges — "you said this was a gap, here's a
reminder to act". Letting a nudge-close flip the answer would mean the
assessment starts answering itself: an auditor would see an addressed gap that
no one ever attested to. Only NIS2 CONTROL_LINK remediations (which carry a real
`controlId`) re-attest their control, and they should.

The skip was already well-documented at the call site. What it lacked was
enforcement: the behaviour is *the absence of a call*, so a future "helpful"
reconciler could add it and nobody would notice the self-assessment had begun
answering itself. It is now locked by
`tests/guards/nis2-gap-reconcile-skip.test.ts` — changing it must be a
deliberate act that updates the test.

### 2 — Watcher notifications on material edits
Watcher activity fired on comment / status / assign, but not on `updateTask` —
so a watcher was never told when the due date moved or the reviewer changed, the
two edits most likely to invalidate their plans.

`updateTask` now emits a watcher activity under a new `updated` kind for
**material** fields only: a due-date reschedule and a reviewer reassignment.
Cosmetic edits (title/description wording) deliberately stay silent — a bell for
every save trains people to ignore the bell. The dedupe discriminator encodes
`before→after` for both fields, so two genuinely different reschedules produce
two bells while a retry of the same write still dedupes.

### 3 — Linked tasks on evidence (wired) and findings (documented)
**Evidence: wired.** Evidence already has a detail surface — the
`EvidenceDetailSheet` quick-look — so the shared `LinkedTasksPanel` mounts there
(the same component the control / risk / asset / incident detail pages use). A
remediation task reconciled back to a piece of evidence is no longer invisible
from the evidence side.

**Findings: documented, not wired.** Two reasons, and the second is the
load-bearing one:
1. Findings have no detail page or sheet at all — only a list and a create
   modal. Building one is a feature, not a residual.
2. More fundamentally, **`FINDING` is not a member of `TaskLinkEntityType`**.
   Tasks attach to findings through a direct `Task.findingId` FK, not through
   `TaskLink` — so `LinkedTasksPanel`, which queries by TaskLink entityType,
   could not serve findings without a different query path anyway.

So the absence is intentional for now. Wiring it properly means either adding
`FINDING` to the link enum (a schema change with migration + backfill
questions) or teaching the panel a second, FK-based query mode. Neither belongs
in a residuals pass. The finding→task direction *is* already visible: the task
detail page renders its source finding with a navigable back-link.

### 4 — Dead metrics trimmed
`getTaskMetrics` computed `bySeverity`, `byType`, `dueIn30d` and `trend`
(`created30d` / `resolved30d`) on **every tasks-list load**, and nothing read
them: the KPI strip renders `total` / `byStatus.OPEN` / `overdue` / `dueIn7d`,
and the sparklines come from the separate `/dashboard/trends` endpoint.
`dueIn30d` was even declared in `TaskListMetrics` under a comment claiming
"only the fields the KPI cards render are declared here" — it wasn't rendered.

All four are removed: **5 fewer queries** (2 `groupBy` + 3 `count`) per
tasks-list load. This follows the precedent set when `topControls` /
`topLinkedEntities` were trimmed for the same reason. Each field can be re-added
cheaply *together with its consumer*.

## Known future work (previously undocumented)

Two long-standing gaps, recorded here so they stop being folklore:

- **Comments are flat.** `TaskComment` has no parent/thread field, so replies
  are conventional ("@name — …"), not structural. Threading means a
  self-referential FK plus a rendering pass; worth doing when comment volume
  justifies it.
- **No recurring-task model.** Every task is a one-off row. Recurring
  obligations (quarterly access reviews, annual policy attestations) are
  currently modelled by whatever raises them — the control test-plan scheduler,
  the policy-review reminder — each with its own cadence logic. A first-class
  recurrence model would unify those, but it is a genuine feature with
  scheduling, timezone, and catch-up semantics to settle.

## Files

| File | Role |
| --- | --- |
| `usecases/task.ts` | watcher fan-out on material `updateTask` edits |
| `notifications/watcher.ts` | new `updated` activity kind |
| `repositories/WorkItemRepository.ts` | trimmed 5 unread metric queries |
| `tasks/TasksClient.tsx` | `TaskListMetrics` drops `dueIn30d` |
| `evidence/EvidenceDetailSheet.tsx` | mounts `LinkedTasksPanel` |
| `tests/guards/nis2-gap-reconcile-skip.test.ts` | locks the confirmed skip |

## Decisions

- **Confirm the NIS2 skip, but enforce it.** A documented absence is only as
  durable as the next reader's attention; a test makes the decision survive.
- **Notify on material edits only.** Notification value is inversely
  proportional to notification volume.
- **Wire evidence, document findings.** Evidence had a surface to hang the panel
  on; findings would have needed a schema or query change to be honest, which is
  out of scope for a residuals pass.
- **Trim rather than wire the metrics.** Re-adding a field with its consumer is
  cheap; paying 5 queries per list load for nobody is not.
