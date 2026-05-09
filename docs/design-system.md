# IC Design System — Primitive-by-Intent Index

This is the front door of the IC frontend design system. New
contributors start here. Every primitive has one canonical home; if
you find yourself hand-rolling something, find the closest entry on
the table below first.

The system was completed across two PR packages:
- **PR-1..PR-10** (the polish package — colour tokens, typography,
  EntityListPage / EntityDetailLayout, action vocabulary, card
  density, search placeholders, interaction polish, ErrorState,
  InlineNotice).
- **v2-PR-1..v2-PR-15** (the Premium Polish package — button cull,
  semantic spacing, StatusBadge cull, motion language, PageHeader,
  DashboardLayout, FilterToolbar slots, MetricCard chassis, Card
  elevation, HeroMetric, NextBestActionCard, list header trio,
  MetadataBar + TabSection, ActionCluster, this index).

---

## Decision tree by intent

### "I need to display…"

| Intent | Primitive | Source |
|---|---|---|
| A page with a list of rows | `<EntityListPage>` | `src/components/layout/EntityListPage.tsx` |
| An entity detail page (header + tabs + body) | `<EntityDetailLayout>` | `src/components/layout/EntityDetailLayout.tsx` |
| A dashboard page | `<DashboardLayout>` | `src/components/layout/DashboardLayout.tsx` |
| A page header (title + actions + breadcrumbs) | `<PageHeader>` | `src/components/layout/PageHeader.tsx` |
| The first verdict on a dashboard (one big number) | `<HeroMetric>` | `src/components/ui/HeroMetric.tsx` |
| A KPI tile inside a dashboard grid | `<KpiCard>` (composes `<MetricCard>`) | `src/components/ui/KpiCard.tsx` |
| A new "single number" card (custom rendering) | `<MetricCard>` chassis | `src/components/ui/MetricCard.tsx` |
| A general-purpose card | `<Card>` | `src/components/ui/card.tsx` |
| A list page filter + actions toolbar | `<FilterToolbar>` | `src/components/filters/FilterToolbar.tsx` |
| A list of tabular data | `<DataTable>` | `src/components/ui/table/` |
| A status pill | `<StatusBadge>` | `src/components/ui/status-badge.tsx` |

### "I need to act…"

| Intent | Primitive | Source |
|---|---|---|
| A button | `<Button>` (variants: `primary \| secondary \| ghost \| destructive \| destructive-outline`) | `src/components/ui/button.tsx` |
| A header action cluster (≤1 primary + ≤1 secondary + ⋯ menu) | `<ActionCluster>` | `src/components/ui/ActionCluster.tsx` |
| A "what should I do next" recommendation card | `<NextBestActionCard>` | `src/components/ui/NextBestActionCard.tsx` |
| A confirmation modal (delete, offboard, etc.) | `<ConfirmDialog>` | `src/components/ui/confirm-dialog.tsx` |
| A picker / selection list | `<Combobox>` | `src/components/ui/combobox.tsx` |
| A dropdown menu | `<Popover>` + `Popover.Menu` | `src/components/ui/popover.tsx` |

### "I need to communicate…"

| Intent | Primitive | Source |
|---|---|---|
| Inline status banner (error/success/warning/info) | `<InlineNotice>` | `src/components/ui/inline-notice.tsx` |
| Full-pane error with retry | `<ErrorState>` | `src/components/ui/error-state.tsx` |
| Full-pane "no data" | `<EmptyState size="md">` | `src/components/ui/empty-state.tsx` |
| In-card "no data" | `<EmptyState size="sm">` | `src/components/ui/empty-state.tsx` |
| Loading skeleton — single card shape | `<SkeletonCard lines={N}>` | `src/components/ui/skeleton.tsx` |
| Loading skeleton — full table | `<SkeletonTable rows cols>` | `src/components/ui/skeleton.tsx` |
| Loading skeleton — dashboard | (opt-in primitives below) | `src/components/ui/skeleton.tsx` |
| Hover tooltip | `<Tooltip>` | `src/components/ui/tooltip.tsx` |
| Help icon with tooltip | `<InfoTooltip>` | `src/components/ui/tooltip.tsx` |
| A toast (transient) | `toast.*` from sonner | (npm dep) |

### "I need to compose detail-page tab content…"

| Intent | Primitive | Source |
|---|---|---|
| A tab body with title + actions | `<TabSection>` | `src/components/ui/TabSection.tsx` |
| A horizontal metadata strip below the header | `<MetadataBar>` | `src/components/ui/MetadataBar.tsx` |

### "I need to lay out…"

| Intent | Primitive | Source |
|---|---|---|
| Form fields | `<FormField>`, `<FieldGroup>`, `<Input>` | `src/components/ui/form-field.tsx`, `field-group.tsx`, `input.tsx` |
| A date picker (single) | `<DatePicker>` | `src/components/ui/date-picker/date-picker.tsx` |
| A date range picker | `<DateRangePicker>` | `src/components/ui/date-picker/date-range-picker.tsx` |
| A modal (create/edit/confirm) | `<Modal>` | `src/components/ui/modal.tsx` |
| A side sheet (inspect-and-edit) | `<Sheet>` | `src/components/ui/sheet.tsx` |
| Tabs | `<TabSelect>` | `src/components/ui/tab-select.tsx` |
| Toggle group / segmented control | `<ToggleGroup>` | `src/components/ui/toggle-group.tsx` |

---

## Token vocabularies

The system is layered over a small set of semantic token vocabularies.
Use the named tokens; never reach for raw numerics.

### Colour
- `bg-bg-{page,default,muted,subtle,elevated,...}` — surfaces
- `text-content-{emphasis,default,muted,subtle,success,warning,error,info}` — text
- `border-border-{default,subtle,emphasis,success,warning,error,info}` — borders
- `bg-bg-{success,warning,error,info}-emphasis` — solid status surfaces

### Typography
- `<Heading level={1|2|3|4}>` — never raw `<h1>` etc. on app pages
- `<Eyebrow>` — uppercase tracking-wide muted label
- `<Caption>` — muted body copy
- `<TextLink>` — inline body links

### Spacing — semantic scale (v2-PR-2)
| Token | rem / px | When |
|---|---|---|
| `tight` | 0.5rem / 8 px | in-row icon+text, small button gaps |
| `compact` | 0.75rem / 12 px | dense form rows, list items |
| `default` | 1rem / 16 px | default block separation, card padding |
| `section` | 1.5rem / 24 px | between major sections inside a page |
| `page` | 2.5rem / 40 px | between top-level page regions |

Use as `gap-tight`, `space-y-section`, `p-default`, etc. Raw
numerics (`gap-2`, `gap-3`, `gap-4`, `gap-6`, `gap-8`) are banned
outside primitives.

### Motion language (v2-PR-4)
- One transition: `transition-colors duration-150 ease-out`.
- One hover affordance for clickable cards: `hover:border-border-emphasis`.
- `hover:translate-*`, `hover:scale-*`, `hover:shadow-*` are banned.
- Focus rings: `focus-visible:ring-2 ring-[var(--brand-default)]/40 ring-offset-2`.

### Card elevation (v2-PR-9)
- `<Card elevation="flat">` — `bg-bg-page`; for nested sub-cards.
- `<Card elevation="raised">` *(default)* — glass-card recipe.
- `<Card elevation="floating">` — `bg-bg-elevated`; modals/popovers.
- No shadows. Depth is expressed via background tone, not box-shadow.

### Button variants (v2-PR-1, post-cull)
- `primary` — recommended next step, brand colour.
- `secondary` — supporting action, neutral surface.
- `ghost` — toolbar / icon-only / quiet action.
- `destructive` — delete / archive / reject.
- `destructive-outline` — destructive icon-only buttons.

`outline`, `success`, and `danger` were retired in v2-PR-1.

### StatusBadge (v2-PR-3, post-cull)
- `<StatusBadge variant="neutral|info|success|pending|warning|error" tone="solid|subtle" size="sm|md">`
- Pill shape locked at the primitive (no className overrides).
- 12 (variant × tone) combinations, 2 sizes.

---

## Per-epic deep dives

For the full rationale behind any primitive, the docs/ folder
carries per-epic deep dives:

- `docs/ui-buttons.md` — button system (PR-2 + v2-PR-1)
- `docs/charts.md` — Epic 59 chart platform
- `docs/modal-sheet-strategy.md` — Modal vs Sheet (Epic 54)
- `docs/combobox-form-strategy.md` — Combobox + form primitives (Epic 55)
- `docs/tooltip-and-copy-strategy.md` — Tooltip + clipboard (Epic 56)
- `docs/keyboard-shortcuts.md` — Shortcut registration (Epic 57)
- `docs/date-picker.md` — Date pickers (Epic 58)
- `docs/destructive-actions.md` — Undo-toast convention (Epic 67)
- `docs/list-virtualization.md` — Virtualization (Epic 68)
- `docs/automation-events.md` — Automation backbone (Epic 60)
- `docs/filters.md` — Filter system (Epic 53)
- `docs/token-cheatsheet.md` — Colour token cheat sheet
- `docs/layout-shells.md` — List/Detail/Dashboard shell decision tree
- `docs/epic-52-list-page-shell.md` — DataTable platform
- `docs/epic-60-shared-hooks-and-polish.md` — Shared hooks

---

## How to add a new primitive

1. **Justify the slot.** Is the visual intent already covered by an
   existing primitive? If yes, extend it. If the new primitive is
   the third-or-later component for the same intent, the answer is
   probably "compose, don't fork."

2. **Type the contract.** Use TypeScript prop types to enforce
   composition rules — single-action slots, ReadonlyArray caps,
   variant unions. The type is the spec.

3. **Forward enforcement.** Add a `tests/guards/<primitive>.test.ts`
   that locks the primitive's render contract + caller pattern.
   Specifically: the variant set, the slot props, the className
   composition, the data-* test markers.

4. **Document the intent.** Update this `design-system.md` index
   with the primitive's row in the right table.

5. **Don't migrate consumers in the same PR.** Ship the primitive,
   land its ratchet, document it. Per-page adoption lands as
   follow-ups — keeps each diff reviewable.

---

## What this index is NOT

- An exhaustive component catalog. There are 80+ files in
  `src/components/ui/`. Most are utility components (icons,
  shimmers, scrollers); only the ~30 primitives that drive page
  composition are listed here.
- A migration guide. Per-epic deep dives carry the rationale and
  before/after examples.
- A theming spec. See `docs/token-cheatsheet.md`.

If a primitive belongs on the table above and isn't listed: the
table is wrong. Open a PR.
