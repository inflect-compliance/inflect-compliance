# 2026-07-02 — "Time" nav badge: my future tasks only

**Commit:** `<pending>` fix(nav): Time badge counts the caller's future tasks (was tenant-wide, zeroed by #1406)

## What / why

The sidebar **Time** (Calendar) nav badge vanished for everyone. Root cause was
PR #1406 ("future-only Time badge", `c0597fd8`): it changed every date filter in
`getUpcomingDeadlineCount` from an overdue-inclusive form to
`{ gt: now, lte: now + 7d }`. Before, the count had no lower time bound, so
overdue work kept it > 0 almost always; after, only items due in the next 7 days
counted, and the sidebar hook hides the badge whenever the count is `0`
(`use-calendar-badge.ts` → `if (count <= 0) return undefined`). For most tenants
the 7-day future window summed to 0 → badge gone. The intended
"assigned to the logged-in user" scoping from that change was also never actually
implemented — the count stayed tenant-wide across five entity types.

Per operator direction the badge is now a **personal task counter**:

- **Tasks only** — controls / evidence / policies / vendors dropped from the
  badge (they remain on the Calendar page + per-entity lists).
- **Assigned to the caller** — `assigneeUserId = ctx.userId`.
- **Future, all of it** — `dueAt > now`, no upper bound by default. The optional
  `days` query param still caps the window when a caller wants "coming up soon".
- Non-terminal status; capped at `99+`.

## Files

| File | Role |
| --- | --- |
| `src/app-layer/usecases/compliance-calendar.ts` | `getUpcomingDeadlineCount` rewritten: single assignee-scoped, future-only task count |
| `src/app/api/t/[tenantSlug]/calendar/upcoming-count/route.ts` | doc: `days` is now an optional cap, omitted = all future |
| `tests/unit/compliance-calendar.test.ts` | badge tests updated — tasks-only, assignee + `dueAt > now` filter, horizon cap |

## Decisions

- **Tasks-only, not all deadline types.** The badge reads as "how much is on my
  plate". Tenant-wide multi-entity deadline pressure belongs on the Calendar
  page, not a personal nav counter.
- **All-future default over a 7-day window.** A week is too tight — a user with
  tasks due in 10 days would still see an empty badge. `days` stays available for
  a bounded view.
- **Backstop:** the `[tenantId, assigneeUserId]` index already covers the new
  predicate; the query is a `count` (no Layer-C list-index guardrail trigger).
