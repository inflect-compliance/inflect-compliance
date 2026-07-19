# 2026-07-19 — Compliance calendar: views + interactions

**Commit:** `<pending> feat(calendar): full timeline, loading state, shared urgency scale, forward heatmap, deep-links, create affordance`

Companion to the deadline-reliability PR. That one fixed what the
calendar *knew*; this one fixes what it *shows* and what you can *do*
from it.

## Design

### 1. The Timeline was an audit-cycle view

`CalendarClient` pre-filtered Gantt input to
`e.end !== undefined || e.category === 'audit'`. Only the audit-cycle
loader ever sets `end`, so the two clauses were near-identical and the
"Timeline" showed audit cycles and nothing else — blank for any tenant
without cycles, even with a range full of deadlines.

The filter is **dropped** rather than the view renamed, because
`GanttTimeline` already renders a point-in-time event as a 1-day marker
with a 0.5% minimum bar width, and its own header comment anticipates the
caller choosing. The filter was discarding events the component could
draw perfectly well. No component change was needed.

### 2. Loading looked exactly like empty

Only `error` was handled — the comment said "Loading + error states" but
there was no loading branch. Every view/range switch mints a new SWR key,
so `data` is `undefined` until it resolves and the grid rendered empty.
`pending` (no data, no error) now dims the grid, sets `aria-busy`, and
shows a spinner row.

### 3. "Due soon" meant three numbers

| surface | urgent | upcoming |
| --- | --- | --- |
| calendar `classifyStatus` | ≤7d | — |
| ExpiryCalendar widget | ≤7d | ≤14d |
| dashboard evidence KPI | ≤7d | ≤30d |

`src/lib/urgency.ts` is now the one scale (`URGENT: 7`, `UPCOMING: 30`)
with `urgencyFromDate` / `urgencyFromDaysUntil`. It is deliberately
framework-free because both halves consume it — the server classifies
events and shapes KPI date-range queries from it, the client renders tone
and labels from it. The widget's ≤14 tier was the only place 14 appeared
anywhere and had no separate meaning, so it folds into ≤30 (its labels
move "Next Week" → "This Month", "This Month" → "Later").

### 4. The heatmap could not show the future

Its window was 365d-back → **today**, so it was purely retrospective
while sitting beside two deadline views. Extended to +180d forward
(matching the timeline), so "busy weeks ahead" is visible where people
look for it.

### 5. Deep-links landed on entity roots

Nine of the twelve sources were navigate-only, and the client never
*constructs* hrefs — they arrive pre-built from the usecase, so this is a
usecase change. Vendor-document expiry now lands on
`?tab=documents` and vendor reassessment on `?tab=assessments`.

That required making the deep-link *real*: the vendor detail page held
tab state locally and ignored the URL, so a `?tab=` link would have
silently landed on Overview. It now seeds from `useSearchParams()` with a
`VENDOR_TABS` allowlist and an overview fallback. A link to a tab the
page ignores is worse than no link, so the ratchet asserts both halves.

Inline non-task actions (mark-reviewed / snooze) are **not** included:
the reviewable entities' mutation surfaces are per-entity flows with
their own validation (the policy page's `mark-reviewed-btn` is a full
version-aware flow, not a one-shot toggle), so a calendar-side shortcut
would need its own usecase rather than being cheap. The field-anchored
deep-link is the honest version of that value.

### 6. Create-from-calendar was invisible

Double-clicking a day opened the New Task modal — with no cursor change,
no tooltip, and nothing in the cell's aria-label. Two affordances added:
a hover/focus-revealed `+` per day cell (keyboard-reachable, not
hover-only) and an explicit button in the side panel. The dblclick
shortcut still works.

### 7. Off-screen deadlines rendered as "nothing due"

Windows are fixed and the month view steps one month at a time, so the
next real deadline can sit outside what's rendered — indistinguishable
from an empty schedule. When a range comes back empty the client probes a
wide forward window (conditional SWR key — costs nothing on the normal
path) and offers "the next deadline is on <date> — jump to it".

Plus the naming: the badge was called "Time" in two source comments,
"Schedule" in the nav catalog, and "Calendar" in the breadcrumb. The
comments now say Calendar.

## Files

| File | Role |
| --- | --- |
| `src/lib/urgency.ts` | **new** — the one urgency scale |
| `.../calendar/CalendarClient.tsx` | unfiltered Gantt, pending state, forward heatmap, off-screen probe + jump, side-panel create button |
| `src/components/ui/CalendarMonth.tsx` | per-day `+` affordance (`newTaskLabel` prop) |
| `src/components/ui/ExpiryCalendar.tsx` | consumes the shared scale; label re-tier |
| `src/app-layer/usecases/compliance-calendar.ts` | `classifyStatus` via shared scale; tab-anchored vendor hrefs; naming |
| `src/app-layer/repositories/DashboardRepository.ts` | KPI buckets via shared scale |
| `.../vendors/[vendorId]/page.tsx` | honours `?tab=` |
| `tests/guards/calendar-ux-completeness.test.ts` | ratchet over all seven |

## Decisions

- **Drop the filter, keep the name.** Renaming to "Audit cycles" would
  have preserved a view nobody needs; the Gantt already handles every
  event shape, so the fix is to feed it everything.
- **`UPCOMING = 30`, not 14.** Two of the three surfaces already used 30
  and the KPI's ≤30 bucket is load-bearing on the dashboard. 14 existed
  in exactly one widget.
- **Fix the vendor page's tab seeding rather than ship a decorative
  link.** Half a deep-link is a worse bug than none.
- **No inline non-task mutations.** "Where cheap" was the bar and they
  aren't cheap — the underlying flows are version/approval-aware.
- **Probe only when empty.** The off-screen hint needs data outside the
  current range; gating the SWR key on `isEmptyView` keeps the normal
  path at exactly one request.
