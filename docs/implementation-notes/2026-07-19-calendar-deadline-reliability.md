# 2026-07-19 — Compliance calendar: deadline reliability

**Commit:** `<pending> fix(calendar): ordered truncation, overdue-inclusive badge, one expiry predicate, six missing sources`

## Design

The calendar bills itself as the deadline hub. Five things stopped it
being trustworthy; each is independent.

### 1. Truncation was silently arbitrary

Every loader ran `take: limit` (default 500) with **no `orderBy`**. The
planner returned whichever 500 rows it liked and the aggregator sorted
*those* — so a busy tenant could lose precisely its soonest deadlines and
never know. Two of the twelve loaders (the Epic G-7 treatment pair)
already ordered; the other ten did not.

Now **every** loader orders ascending on the date column it ranges on, so
a cap that bites keeps the NEAREST N. Multi-date sources (vendor, risk,
audit cycle) order by both columns — approximate but deterministic, and
Postgres sorts NULLs last on ASC which is the behaviour we want.

Truncation is also no longer silent. Each loader returns
`{ events, capped }` (`capped` compares DB **rows**, not events — vendor
emits two events per row), the aggregator collects the capped source
names, and `CalendarResponse` gained:

```ts
truncation: { capped: boolean; sources: CalendarSourceName[]; perSourceLimit: number }
counts: { …; partial: boolean }
```

`CalendarClient` renders a notice when `capped`. `counts.partial` stops a
post-truncation undercount being presented as authoritative — without
paying for 17 extra `count()` queries to make the total exact.

### 2. The badge could read 0 while the page was full of red

`getUpcomingDeadlineCount` filtered `dueAt > now`, so a user whose work
was **entirely overdue** saw an empty badge — the worst state rendered as
the calmest. Overdue is now always in scope (no lower bound);
`horizonDays` caps only the forward side.

Scope stays "my assigned tasks" deliberately — fanning 17 sources out on
every sidebar render is a per-page-view cost, and the page already owns
the tenant-wide view. What was missing was *legibility*: `NavItem` gained
a `badgeLabel` (aria-label + title) so the chip states its own scope
instead of letting a small number read as "the tenant is fine".

### 3. Evidence expiry was defined three ways

Calendar (no `deletedAt`/`isArchived` guard at all), the dashboard
`getUpcomingExpirations` list, and the `getEvidenceExpiry` KPI each had
their own predicate, so the same row could be red on one screen, absent
from another, counted on a third — and the calendar showed **phantom
reviews for soft-deleted evidence**.

`src/app-layer/domain/evidence-expiry.ts` now owns both halves of the
definition — SCOPE (`evidenceExpiryScopeWhere`) and OUTSTANDING
(`EVIDENCE_OUTSTANDING_STATUS_FILTER`) — and all three surfaces spread it.

### 4. Six deadline sources were missing

Each already had a reminder job, so the platform *already* treated the
date as a deadline; the calendar just wasn't showing it. Five added:

| source | date | note |
| --- | --- | --- |
| `AccessReview` | `dueAt` | indexed already |
| `ControlException` | `expiresAt` | APPROVED only — others aren't in force |
| `IncidentNotification` | `dueAt` | NIS2 Art.23 SLA; non-null column |
| `TrainingAssignment` | `dueAt` | **needed a new index** |
| `VendorAssessment` | `nextReviewAt` | **needed a new index**; distinct from `Vendor.nextReviewAt` |

`ReportSchedule.nextRunAt` is deliberately **excluded** and the docblock
says so: it is a system automation trigger ("the platform will generate
this report"), not an obligation a person can miss. Putting it beside
real deadlines would dilute "what's due".

### 5. The dead `evidence-expiry` type

`CALENDAR_EVENT_TYPES` carried `evidence-expiry` with **no loader ever
emitting it** — a filter value that always returned zero — and the
docblock promised `Evidence.expiredAt` as a source. Deleted, because
`expiredAt` cannot be a deadline: the retention job stamps it *at* the
moment of expiry (`retention.ts` sets `expiredAt = now`), making it a
past-tense receipt. `nextReviewDate` is the deadline and already ships as
`evidence-review`.

## Files

| File | Role |
| --- | --- |
| `src/app-layer/usecases/compliance-calendar.ts` | orderBy on every loader; `CalendarSourceResult` + capped reporting; 5 new loaders; overdue-inclusive badge; docblock truth |
| `src/app-layer/domain/evidence-expiry.ts` | **new** — the one expiry definition |
| `src/app-layer/repositories/DashboardRepository.ts` | KPI + expiry list route through the shared predicate |
| `src/app-layer/schemas/calendar.schemas.ts` | truncation report, `counts.partial`, source names, new types/entities, dead type removed |
| `src/app/t/[tenantSlug]/(app)/calendar/CalendarClient.tsx` | truncation notice |
| `src/components/layout/nav-item.tsx` + `SidebarNav.tsx` | `badgeLabel` so the badge states its scope |
| `prisma/migrations/20260719120000_calendar_deadline_source_indexes/` | two composite indexes for the new loaders |

## Decisions

- **Order by the date column, not by a computed "nearest".** For
  multi-date sources a true LEAST() ordering isn't expressible in Prisma
  `orderBy`; a column-priority array is deterministic, index-friendly, and
  close enough that the cap keeps sensible rows. Documented at each site.
- **`capped` compares rows, not events.** Vendor and risk emit two events
  per row; comparing `events.length` to the limit would under-report.
- **Label the badge rather than broaden it.** Both options were open. A
  17-source fan-out per sidebar render is a real cost on every page view;
  the cheap honest fix is to say what the number means.
- **Reuse existing categories for the new types.** The palette has four
  status tones and eight categories already consume them, so a new
  category would ship with no distinct colour. `type` stays distinct in
  every case; the category→type mapping is documented in the schema.
- **Exclude `ReportSchedule`, and say so in the docblock.** "Narrow the
  promise" is a legitimate answer to an aggregation gap when the entity
  isn't actually an obligation.
