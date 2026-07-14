# 2026-07-14 — Issue vs Task: one work-item model, one evidence-bundle concept

**Commit:** _(TP-2 — remove ControlTask stack)_

## Design

The product has, at various points, carried three things that all looked
like "a unit of work":

  - **`ControlTask`** — a per-control task with its own 4-value status enum,
    orphaned-but-routable. **Removed in TP-2** (this cohort). Residual rows
    were migrated into `Task`; the model, enum, repo methods, routes, and
    modals are gone. The control-detail Tasks tab already rendered unified
    `Task` rows via `LinkedTasksPanel`, so nothing user-facing changed.
  - **`Task`** — the unified work-item aggregate (`Task` + `TaskLink` +
    `TaskComment` + `TaskWatcher`, BullMQ jobs, the `/tasks` list). This is
    the single canonical "someone owns this piece of work" model.
  - **`Issue`** — historically a second work-item surface. It was already
    collapsed onto `Task`: `src/app-layer/usecases/issue.ts` delegates its
    CRUD / list / status / assignment / comment / link paths to
    `WorkItemRepository` (i.e. real `Task` rows), and **every `/issues*` UI
    page 307-redirects to its `/tasks` equivalent**
    (`issues/page.tsx` → `/tasks`, `issues/[issueId]` → `/tasks/[id]`,
    `issues/new` → `/tasks/new`).

### Decision: KEEP Issue, do not merge it away

`Issue` is retained because it is **not** a redundant work-item model — the
only thing it still owns that `Task` does not is the **audit
evidence-bundle / freeze** lifecycle:

  - `EvidenceBundleRepository` — grouping evidence into a named bundle.
  - `assertCanManageBundles` / `assertCanFreeze` — freezing a bundle so it
    becomes an immutable snapshot for an audit.

That concept has no home on `Task` and is meaningful to auditors, so the
usecase stays. The plain work-item functions in `issue.ts` remain only for
backward compatibility with the old Issue API routes; new work-item code
should target the `Task` surface directly.

There is therefore **no parallel work-item LIST UI** left for Issues —
confirmed by grep: all `/issues*` pages are thin server redirects, no
`DataTable`/`EntityListPage` mounts remain under `issues/`.

## Files

| File | Role |
| --- | --- |
| `src/app-layer/usecases/issue.ts` | Top-of-file comment clarifying Issue = evidence-bundle/freeze, Task = the unified work-item. |
| `docs/implementation-notes/2026-07-14-issue-vs-task.md` | This note. |

## Decisions

- **Why not delete `issue.ts` outright?** The evidence-bundle/freeze surface
  is live and auditor-facing; deleting the usecase would take it with it.
  The work-item CRUD delegation is cheap to keep and preserves the old API
  routes.
- **Why keep the `/issues*` redirects rather than 404?** Bookmarked links and
  external references to `/issues` should land the user on the equivalent
  Task, not a dead end.
