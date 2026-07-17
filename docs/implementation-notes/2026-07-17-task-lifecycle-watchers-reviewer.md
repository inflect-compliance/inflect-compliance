# 2026-07-17 — Task lifecycle: watchers, reviewer role, linked-tasks surfacing

**Commit:** `<pending> feat(tasks): finish watchers, reviewer sign-off, linked-tasks surfacing`

## Design

Three half-built task-lifecycle features finished, plus link-type coverage.

1. **Watchers notify (bell).** `TaskWatcher` add/remove was fully wired but
   no emitter ever notified a watcher — watching delivered nothing. A new
   `src/app-layer/notifications/watcher.ts` (`createWatcherNotifications`)
   fans task activity to every watcher's bell, and `task.ts` calls it from
   all three emitters: `addTaskComment`, `setTaskStatus`, `assignTask`. The
   actor is excluded (you're never notified of your own action). Deduped per
   `(tenantId, TASK_WATCH, taskId, watcherUserId, kind, discriminator)` —
   finer than the assignment key (which is per-day) so distinct events don't
   collapse, but a retry of the same event does. SSE-pushed like assignment.

   **Channel decision — bell, NOT per-event email.** A watched task can take
   many comments / status changes a day; an email per event to every watcher
   is the fatigue that makes people stop watching (GitHub/Linear route
   watched-item activity to the in-app feed, not the inbox). Email stays
   reserved for direct assignment — a stronger, lower-frequency signal.

2. **Reviewer sign-off gate.** `reviewerUserId` was persisted + settable on
   the detail page but inert: `setTaskStatus` never read it and there was no
   IN_REVIEW status. Added:
   - `IN_REVIEW` to `WorkItemStatus` (active, non-terminal) + the state-machine
     graph (reachable from every active state; leads to close / bounce-back /
     cancel).
   - A gate in `setTaskStatus`: when a task has a `reviewerUserId`, it cannot
     complete (RESOLVED/CLOSED) directly from an active state — the close MUST
     pass through IN_REVIEW **and** be driven by the reviewer. CANCELED is
     exempt (cancelling ≠ completing); RESOLVED→CLOSED bookkeeping is exempt
     (sign-off already happened on IN_REVIEW→RESOLVED).
   - The create form now sends `reviewerUserId` (a reviewer picker in
     `NewTaskFields`), so a reviewed task starts with the gate armed.
   - IN_REVIEW threaded through every status surface: badge map, list filter,
     detail + control-panel pickers, bulk-status options, the API status
     enums (`SetTaskStatusSchema` / `BulkTaskStatusSchema`), and the
     automation status allowlist.

3. **Linked tasks surfaced.** `LinkedTasksPanel` was mounted only on
   control/risk/asset detail. The policy-review + evidence-expiry jobs create
   POLICY/EVIDENCE `TaskLink` rows that no source page rendered. Mounted the
   panel on **policy**, **vendor**, and **incident** detail. Incidents were
   not a `TaskLinkEntityType`, so `INCIDENT` was added to the enum + the link
   schema + the resolver, making incident↔task linking real end-to-end.
   (Findings + evidence have no routed per-item detail page — out of scope;
   noted as a follow-up.)

4. **Manual-link type coverage.** The task-detail link form's
   `ENTITY_TYPE_OPTIONS` omitted POLICY/VENDOR/FILE/AUDIT_PACK though the enum
   + API already accepted them. Added those + INCIDENT so a user can manually
   link a task to a policy / vendor / incident / file / audit-pack.

## Decisions

- **IN_REVIEW gate keys on `!isTerminalStatus(fromStatus)`** so it fires only
  on the non-terminal→terminal completion. RESOLVED→CLOSED (terminal→terminal)
  is exempt — the reviewer already signed off to reach RESOLVED.
- **Watcher email deliberately omitted** — see the channel decision above.
- **INCIDENT added as a real link type** rather than skipping incident
  surfacing — it dovetails with the link-type completion (item 4) and makes
  "incident detail shows its linked tasks" true rather than empty.
- **Two migrations** — the IN_REVIEW + INCIDENT enum additions, and a separate
  `TASK_WATCH_UPDATE` `NotificationType` value (the bell type for watcher
  activity). All additive `ALTER TYPE … ADD VALUE`.
