# 2026-07-02 — Subtitle-led headers: main pages only

**Commit:** `<pending>` fix(ui): hide the page H1 on MAIN pages only; restore it on subpages

## Context

#1406 ("subtitle-led page headers") made `PageHeader` render its `<h1>`
**`sr-only` unconditionally** — every page that used the shared primitive lost
its visible title. Two problems surfaced:

1. **Incomplete** — the many list pages that *hand-roll* their own
   `<Heading level={1}>` (Assets, Risks, Tasks, Calendar, Frameworks, Mapping,
   Tests) never routed through `PageHeader`, so they kept a big visible H1. The
   result was inconsistent: Dashboard/Controls (on the primitive) lost their
   header, Assets/Risks (hand-rolled) didn't.
2. **Too broad** — it also hid the H1 on **subpages** (detail pages via
   `EntityDetailLayout`, the `/admin` landing, etc.), which should keep a
   visible title.

## Change

The intended behaviour is **MAIN pages lead with the subtitle (H1 hidden);
SUBPAGES keep a visible H1**. That MAIN-vs-SUBPAGE split already has a source of
truth: `src/lib/nav/page-segregation.ts` (`classifyRoute`).

- **`PageHeader`** now hides the H1 only when
  `classifyRoute(usePathname()) === 'main'` (kept `sr-only` for the a11y
  landmark). Subpages render the H1 visibly again — restoring what #1406 hid.
- **The 7 hand-rolled MAIN list clients** (Assets, Risks, Tasks, Calendar,
  Frameworks, Mapping, Tests) get `className="sr-only"` on their `<h1>`. They're
  1:1 with their main route, so the hide is unconditional there.
- `/audits` and `/policies` already route through `PageHeader`/`EntityListPage`,
  so they're handled by the classification automatically — no per-page edit.

## Decisions

- **Route classification, not per-page props.** `EntityListPage` is used by both
  main pages (Controls, Policies, Vendors) and subpages (audits/business-
  continuity, a processes tab), so a blanket prop there would be wrong. Driving
  the H1 off `classifyRoute` is correct for every `PageHeader` consumer at once
  and needs no per-client wiring.
- **Unknown routes default to visible.** `classifyRoute` → `'unknown'` yields a
  visible H1 — the safe default.
- **A11y preserved.** The H1 stays in the DOM (`sr-only`), so the landmark and
  the `page-header-title` contract are intact; `page-header-discipline` +
  the rendered PageHeader/EntityListPage/EntityDetailLayout tests stay green.

## Files

| File | Change |
| --- | --- |
| `src/components/layout/PageHeader.tsx` | H1 `sr-only` iff `classifyRoute(pathname) === 'main'` (was unconditional) |
| `assets/AssetsClient.tsx`, `risks/RisksClient.tsx`, `tasks/TasksClient.tsx`, `calendar/CalendarClient.tsx`, `frameworks/FrameworksClient.tsx`, `mapping/page.tsx`, `tests/page.tsx` | `sr-only` on the hand-rolled main-page `<h1>` |
