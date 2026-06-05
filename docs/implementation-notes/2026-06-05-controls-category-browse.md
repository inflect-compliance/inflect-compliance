# 2026-06-05 — Controls "Browse" rail by framework-tagged category

**Commit:** _(pending)_ feat(controls): browse rail groups by framework-tagged category

## Design

The Controls list "Browse" right-rail previously offered three **filter**
sections — Status / Type / Owner — each clicking through to a
`filterCtx.set(...)` that re-queried the table. Two problems:

1. The "Type" section read `Control.category`, but that column wasn't
   even in the list `SELECT`, and the demo/seed controls never set it —
   so the section was effectively dead. Where it did populate (template
   adoption), it carried only the four coarse ISO 27001:2022 *themes*
   (Organizational / People / Physical / Technological).
2. The user wanted to *browse* controls by the granular functional
   domains practitioners actually reason in ("Access control",
   "Physical & environmental", "Cryptography", …), tagged with the
   framework each category belongs to — not a flat status filter.

### What changed

- **A shared taxonomy module** (`src/lib/controls/control-taxonomy.ts`)
  is the single source of truth. It maps every one of the 93 ISO
  27001:2022 Annex A clauses to one of 15 granular domains (ISO
  27002:2022 functional grouping, aligned with the classic 2013 Annex A
  domain names), and detects the other seeded frameworks (SOC 2 / NIS2 /
  ISO 9001 / 28000 / 39001 / NIST 800-53) by code prefix. `categorizeControl()`
  returns `{ frameworkKey, frameworkLabel, category }`.

  Categories are **derived at runtime** from each control's
  `annexId` / `code` (+ persisted `category` fallback for non-ISO
  frameworks). No migration / prod backfill is needed — it works
  retroactively for every existing control, and the same control set
  surfaces categories from *multiple* frameworks, each carrying its own
  framework tag.

- **The Browse rail is now a category accordion** (`ControlsClient.tsx`).
  One collapsible `<Accordion>` section per `(framework, category)`
  group, the framework rendered as a small tag under the category name,
  a control count on the right. Expanding a section reveals the controls
  in it — each row showing a **status tag** (`StatusBadge`) and
  navigating to the control detail page on click. The rail **navigates;
  it no longer filters**. Status moved from a browse dimension to a
  per-control tag, exactly as briefed.

- **The table "Type" column became "Category"**, deriving the same
  framework-tagged granular category via `categorizeControl`.

- **The catalog seed** (`prisma/seed-catalog.ts`) persists the granular
  ISO domain into `FrameworkRequirement.category` + `ControlTemplate.category`
  (keeping `theme` separately) by importing the *same* taxonomy module,
  so persisted data never drifts from what the rail derives.

## Files

| File | Role |
| --- | --- |
| `src/lib/controls/control-taxonomy.ts` | NEW — clause→domain map (93), framework detection, `categorizeControl()`. Dependency-free so the seed can `require` it under tsx. |
| `src/lib/controls/__tests__/control-taxonomy.test.ts` | NEW — 93-clause coverage, framework detection, multi-framework grouping. |
| `src/app/t/[tenantSlug]/(app)/controls/ControlsClient.tsx` | Browse rail → category accordion; Type column → derived Category tag. |
| `src/app-layer/repositories/ControlRepository.ts` | Added `category` to the list `SELECT` (cross-framework fallback). |
| `prisma/seed-catalog.ts` | Persist granular ISO domain into requirement + template `category`. |
| `tests/guardrails/b7-layout-redesign.test.ts` | Re-anchored the rail + column ratchet to the accordion design. |

## Decisions

- **Derive, don't migrate.** Storing one granular category string per
  control couldn't represent multi-framework membership and would need a
  prod backfill of historical rows. Deriving from `annexId`/`code` is
  framework-aware, multi-framework, and retroactive for free. The seed
  still persists the ISO category for durability + the framework-tree /
  coverage views, sourced from the same module so the two can't drift.
- **Granular domains over the 4 themes.** The user's exemplars ("Access
  control", "physical") are the granular functional domains, not the
  four 2022 themes the fixture carries. The clause→domain map encodes
  the 15-domain taxonomy; the four themes remain on
  `FrameworkRequirement.theme` untouched.
- **Framework detection by code prefix** (CC* → SOC 2, NIS2-/QMS-/SCS-/
  RTS-, NIST family prefixes) because controls don't carry a framework
  FK and tenant controls don't reliably have requirement links. ISO is
  detected by the bare Annex-clause shape, guarded so `CC5.1` etc. fall
  through to their own detector.
- **Status is a tag, not a filter.** Per the user's revision, the rail
  stopped filtering entirely; status visibility is preserved as a
  per-control `StatusBadge` inside the expanded rows (and the table
  Status column, unchanged).
