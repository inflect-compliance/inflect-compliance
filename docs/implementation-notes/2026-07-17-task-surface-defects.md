# 2026-07-17 — Task-surface defects

**Commit:** `<pending> fix(tasks): task-surface defects — INFO severity, deep-link filters, cleanups`

## Design

A batch of smaller task-surface defects. The ones that mislead users are
fixed; the two "decide scope" items (recurrence, RESOLVED filter) are
resolved with an explicit, documented decision.

1. **INFO severity trap (fixed).** The create dropdown offered INFO but the
   frontend Zod enum (`task-form.ts`) rejected it, so picking INFO silently
   disabled Create; the list filter also omitted it. INFO is a real
   `WorkItemSeverity` (automation raises INFO tasks) and is valid in the
   server schema — so this was a frontend-only gap. Added INFO to the create
   schema **and** the list severity filter (consistent, creatable + filterable).

2. **Deep-link filters on SSR (fixed).** The tasks page whitelisted only
   `q/status/type/severity/due`, so a bookmarked `?source=` / `?assigneeUserId=`
   / `?controlId=` rendered unfiltered and didn't restore the chip. Added those
   keys to the SSR whitelist + initialFilters. (`priority` is deliberately NOT
   added — it appears in `TaskQuerySchema` + comments but is **not** an actual
   filter chip in `filter-defs`, so there is nothing to restore.)

3. **Recurring/cadence tasks — DECIDED: out of scope, noted as a known gap.**
   There is no recurrence model, so periodic compliance cadences can't
   auto-generate tasks. Building it properly is a feature — not a defect fix —
   and belongs in its own PR. The concrete sketch for that follow-up:
   - a `Task.recurrence` cadence field (reuse `ControlFrequency`:
     `DAILY/WEEKLY/MONTHLY/QUARTERLY/ANNUALLY`, nullable = one-shot);
   - spawn the next occurrence when a recurring task reaches a terminal
     RESOLVED/CLOSED (NOT CANCELED) in `setTaskStatus` — copy
     title/type/severity/priority/assignee/reviewer/controlId, advance `dueAt`
     via the existing `computeNextDueAt(recurrence, now)`, preserve `recurrence`;
   - a recurrence select on the create form.
   Flagged here explicitly rather than left silent.

4. **Residual cleanups.**
   - **RESOLVED list filter — KEPT (premise corrected).** The prompt asked to
     remove RESOLVED "it's not assignable anywhere else". Ground truth: RESOLVED
     **is** API/state-machine-settable (`SetTaskStatusSchema` accepts it;
     `OPEN/TRIAGED/IN_PROGRESS → RESOLVED` are legal transitions) — it's only
     retired from the *detail-page picker*. Legacy + API/automation-resolved
     rows exist, so filtering for them is legitimate, and the
     `task-status-vocabulary` guard **requires** the list status filter to
     mirror the full enum. Removing it would hide those rows and break the
     guard. Left in place.
   - **Duplicate "Reporter" row (fixed).** Both "Reporter" and "Created By"
     bound `createdBy.name` (the Task model has no separate reporter). Removed
     the redundant Reporter cell.
   - **Overview cards tab-guard (fixed).** The assignee / reviewer / watcher
     cards rendered on *every* tab (evidence, links, comments, activity) —
     wrapped them in `{tab === 'overview' && …}`. (Assignee/reviewer are
     draft+Save; watchers mutate on click — the single guard is safe for both.)
   - **`getTaskMetrics` unused fields — TRIMMED.** `topControls` (1 groupBy +
     1 findMany) and `topLinkedEntities` (1 groupBy) were computed on every
     tasks-list load but no surface read them — four wasted queries. Trimmed.
     A "top controls by open tasks" widget is a worthwhile follow-up; the
     aggregation re-adds cheaply when a consumer exists.
   - **Links tab `entityType="ISSUE"` — VERIFIED CORRECT (not a bug).** The
     vendor-link system keys tasks under `ISSUE` (issue ids ARE task ids;
     `VendorLinkEntityType` has no `TASK` member — passing "TASK" would 400).
     Added a clarifying comment so it isn't "fixed" wrongly.
   - **Comment threading (no `parentId`) — noted v1 limitation, not built.**

## Decisions

- **INFO fix is additive frontend-only** — INFO was already valid server-side;
  the bug was the frontend enum + filter omitting it.
- **RESOLVED stays filterable** — the prompt's premise ("not assignable") is
  inaccurate; RESOLVED is reachable via API/state-machine and the guard
  requires the filter to mirror the enum.
- **Metrics trimmed, not surfaced** — removing four dead queries is a concrete
  win with a contained blast radius (repo + one unit test); a widget is a
  clean additive follow-up.
