# 2026-07-19 — Reviewer four-eyes gate: closing the bypasses (PR-AA)

**Commit:** `<sha> fix(tasks): enforce the reviewer gate on the bulk path, close the opt-out + self-review holes, fix dead link options, localize IN_REVIEW`

## Design

The reviewer sign-off gate (TP-2) is a **compliance control** — four-eyes on
task completion. It shipped with three ways around it, plus two UI defects on
the surfaces that make it legible. All five are closed here.

### 1 — The bulk bypass (the serious one)
`bulkSetTaskStatus` validated the state machine and the resolution text but
never read `reviewerUserId`, so `POST /tasks/bulk/status` could take a
reviewer-gated task straight to RESOLVED/CLOSED — skipping IN_REVIEW *and* the
reviewer-identity check. Select one checkbox, hit bulk-close, sign-off gone.

The gate is now extracted into **one shared helper**,
`checkReviewerSignOffGate({ reviewerUserId, fromStatus, toStatus, actorUserId })`,
which both the single-task and bulk paths call — so the two can no longer
drift. `WorkItemRepository.listByIds` selects `reviewerUserId` to feed it.

The bulk path rejects the **whole batch** on violation rather than skipping
rows, matching the all-or-nothing contract already there for illegal
transitions: a bulk close that would violate sign-off is an error the caller
must see, not a partial success they might not notice.

### 2 — The opt-out and self-review holes
- **Opt-out:** once a task genuinely requires review (it has a reviewer AND has
  reached or passed IN_REVIEW), `updateTask` now refuses to clear or reassign
  `reviewerUserId` for anyone who is not the sitting reviewer or an admin.
  Previously an editor could `PATCH { reviewerUserId: null }` and walk the task
  out of the gate. **Admins retain the override on purpose** — a departed
  reviewer must not deadlock a task — and the action is audited via
  `TASK_UPDATED`.
- **Self-review:** `assertReviewerIsNotAssignee` rejects reviewer === assignee.
  It is enforced on **three** paths, not the two the brief named: `createTask`,
  `updateTask` (reviewer side) and **`assignTask`** (assignee side) — assigning
  a task to the person who is already its reviewer collapses four eyes into two
  just as effectively as the reverse.

There is **no per-tenant "allow self-review" setting** in the schema today
(`TenantSecuritySettings` has no task/review fields), so per the brief this is
enforced unconditionally. `assertReviewerIsNotAssignee` is the single place a
future setting would be consulted.

### 3 — Dead manual-link options
The link form offered nine entity types; the picker resolved six, so four
rendered an empty dropdown. Resolution:

| Type | Action | Endpoint |
| --- | --- | --- |
| POLICY | wired | `/policies` |
| AUDIT_PACK | wired | `/audits/packs` |
| INCIDENT | wired | `/incidents` |
| FILE | **removed** | no list endpoint exists |
| FRAMEWORK_REQUIREMENT | **removed** | needs a per-framework `frameworkKey` the page never passes |

**INCIDENT was deliberately NOT mapped to ISSUE** (the obvious-looking move,
and the one originally suggested): there is no `Issue` model at all, and
`/issues` is a deprecated compat route that forwards to the **Task** usecases.
Mapping INCIDENT→ISSUE would have filled the dropdown with tasks and minted
`TaskLink` rows whose `entityType` said INCIDENT while `entityId` pointed at a
Task — silent data corruption. There is a real `Incident` model and a real
`/incidents` endpoint; INCIDENT resolves there. A guard assertion pins this.

The two removals follow the brief's "remove the unsupported options until the
picker supports them", each with a comment recording the exact precondition for
re-adding.

### 4 — IN_REVIEW localization
Two hand-rolled `buildStatusLabels` maps omitted IN_REVIEW, so the detail
combobox offered a **blank** option and badges rendered raw `"IN_REVIEW"`.
Rather than patch the two maps, both now **derive from the shared
`TASK_STATUS_BADGE`** source — adding a `WorkItemStatus` populates every
surface automatically, so this bug class cannot recur.
`buildTaskStatusCbOptions` also gained a `|| val` fallback. Four surfaces
verified: detail combobox, detail badge, list badge, bulk dropdown.

## Files

| File | Role |
| --- | --- |
| `usecases/task.ts` | `checkReviewerSignOffGate` + `assertReviewerIsNotAssignee`; bulk gate; updateTask/createTask/assignTask guards |
| `repositories/WorkItemRepository.ts` | `listByIds` selects `reviewerUserId` |
| `tasks/[taskId]/page.tsx` | offered link types trimmed to the resolvable set; labels from shared source |
| `tasks/TasksClient.tsx` | labels from shared source |
| `components/.../entity-picker.tsx` | POLICY / AUDIT_PACK / INCIDENT resolution |
| `tests/integration/task-reviewer-watcher.test.ts` | bulk-gate, clear-reviewer, self-review coverage |

## Decisions

- **One gate helper, two callers.** The bypass existed because the rule lived
  inline in `setTaskStatus`. Extracting it makes "bulk forgot the gate"
  structurally impossible to repeat quietly.
- **Reject the batch, don't skip the row.** Silent partial success on a
  compliance control is worse than a loud failure.
- **Admin override kept, and tested.** Documented as an intentional carve-out
  with its own test, so it reads as a decision rather than an oversight.
- **Derive labels from the shared badge source** instead of adding the missing
  key to two maps — fixes the instance *and* the class.
- **A found bug worth noting:** switching the bulk path's `existingMap` from
  id→status to id→row broke the audit entry's `fromStatus` (it began writing an
  object, failing `validateAuditDetailsJson`). Only the new behavioural test
  caught it — a reminder that the audit trail for a control needs coverage as
  much as the control does.
