# 2026-05-21 — Structural index / query-shape guardrail framework

**Commit:** `<pending> test(guardrails): generalized index + query-shape guardrails`

## Design

Replaces two ad-hoc tests (`list-query-indexes.test.ts`,
`task-list-query-indexes.test.ts`) with a generalized, schema-derived
framework. The retired tests pinned a hand-listed set of composite
indexes to specific migration filenames — they were coupled to
migration history and covered only the indexes a human remembered to
list. A new tenant-scoped model or a new foreign key was invisible to
them; the guardrail did not grow with the schema.

The new framework has six layers across three files.

### Foundation — `tests/helpers/prisma-schema-models.ts`

A structured Prisma-schema parser. `parseSchemaModels()` returns one
`SchemaModel` per `model X { ... }` block, carrying: scalar/relation
fields, `@@index` / `@@unique` / `@@id` field lists (with
`(sort:)` / `(ops:)` modifiers and trailing `map:` / `type:` args
stripped), the field-level `@id` / `@unique` fields, and the
`@relation(... fields: [...])` foreign-key groups. `leadingIndexedFields(model)`
returns the set of fields that LEAD some index/uniqueness construct —
the fields Postgres can do an efficient leftmost-prefix lookup on.

It is a hand-rolled, dependency-free line scanner: Prisma exposes no
stable schema-AST API for test tooling, and the surface needed
(models, the four index/uniqueness constructs, relation FK lists) is
small and regular.

### Index layers — `tests/guardrails/schema-index-coverage.test.ts`

- **Layer A (auto)** — every model with a `tenantId` scalar must have
  `tenantId` LEADING some index: an `@@index` / `@@unique` / `@@id`,
  OR a field-level `@id` / `@unique` on `tenantId` itself (all
  recognised via `leadingIndexedFields`). Derived entirely from the
  schema: every current and future tenant model is covered with zero
  maintenance. `TENANT_INDEX_EXEMPT` is empty — every tenant model
  today is correctly tenant-indexed; the map remains as the escape
  hatch for a future genuine exception.

- **Layer B (auto)** — every scalar foreign-key field (the
  `fields: [...]` side of a `@relation`) must be adequately indexed:
  it LEADS some index, OR — on a tenant-scoped model — it is the
  second column of a `[tenantId, fk]` composite (every repository
  query carries `tenantId`, so that composite serves the universal
  `WHERE tenantId = ? AND fk = ?` reverse lookup). `tenantId` is
  skipped (Layer A owns it). `FK_INDEX_EXEMPT` baselines 80 FKs that
  are genuinely un-indexed — actor FKs, 1:1 pointers, library tables,
  rare reverse lookups, and child-via-parent. Each entry carries one
  of five honest reason classes.

- **Layer C (curated)** — `LIST_QUERY_INDEXES`, a reviewed list of
  multi-column indexes backing specific list filter+sort shapes. The
  MERGE of the two retired tests (12 entries, exact fields +
  justifications preserved). Checks the LIVE schema, decoupled from
  migration filenames.

- **Layer C-completeness (auto)** — the forcing function. Scans
  `src/app-layer` for `.findMany(` calls, maps accessor → model, and
  asserts every tenant-scoped model that is `findMany`'d somewhere is
  EITHER in `LIST_QUERY_INDEXES` OR in
  `LIST_MODELS_TENANT_INDEX_SUFFICIENT` (52 entries — models whose
  list query is fully covered by Layers A+B). A new `findMany` on a
  model in neither map fails the test, forcing index triage.

### Query layers — `tests/guardrails/query-shape-guardrails.test.ts`

- **Layer D1** — no Prisma READ inside a loop (N+1). Scans
  `src/app-layer` for loop constructs (`for`, `for await`, `while`,
  `.map`, `.forEach`, `.flatMap`), balances each loop body, and finds
  Prisma read calls inside. WRITE calls are deliberately not flagged.
  Escape hatch: `// guardrail-allow: n+1`. `KNOWN_N_PLUS_ONE`
  baselines 20 current violations — all intentional idempotency
  checks in bounded import/seed loops, per-framework rollups, or
  snapshot-freeze loops.

- **Layer D2** — unbounded `findMany` budget. Counts repository
  `findMany` calls with no `take:` and no `// guardrail-allow:
  unbounded` pragma. `UNBOUNDED_FINDMANY_BUDGET = 54` is a one-way-
  down ceiling; a companion test forbids slack drift > 5, mirroring
  `formfield-coverage.test.ts`.

### Auto vs curated; the forcing function

Layers A, B, and C-completeness are AUTOMATIC — their coverage is
derived from the schema / source, so they grow with the codebase
without edits. Layer C is CURATED because a composite index reflects
a specific filter+sort shape that only a human can justify. The
C-completeness layer bridges the two: it cannot tell whether a model
NEEDS a composite index, but it CAN force a human to make that
decision the moment a new model gets a `findMany`.

### How the baselines ratchet down

Every exempt / baseline map has a written reason per entry and a
"no stale entries" test that fails if an entry no longer applies
(the FK got an index, the loop was fixed). The direction of travel is
toward zero: when a real index lands for an `R_TODO_INDEX` FK, or an
N+1 loop is hoisted to a single `in:` query, the entry is deleted in
the same diff — the no-stale test enforces that. The D2 budget drops
in lockstep with reality via the slack-drift test.

## Files

| File | Role |
|------|------|
| `tests/helpers/prisma-schema-models.ts` | NEW — structured Prisma-schema parser (`parseSchemaModels`, `leadingIndexedFields`). |
| `tests/guardrails/schema-index-coverage.test.ts` | NEW — index Layers A / B / C / C-completeness + registry integrity. |
| `tests/guardrails/query-shape-guardrails.test.ts` | NEW — query Layers D1 (N+1) and D2 (unbounded findMany budget). |
| `tests/guardrails/list-query-indexes.test.ts` | DELETED — coverage folded into `LIST_QUERY_INDEXES` (Layer C). |
| `tests/guardrails/task-list-query-indexes.test.ts` | DELETED — coverage folded into `LIST_QUERY_INDEXES` (Layer C). |
| `docs/implementation-notes/2026-05-21-index-query-guardrails.md` | NEW — this note. |
| `CLAUDE.md` | EDIT — contributor subsection on the index/query guardrails. |

## Decisions

- **Hand-rolled parser, not Prisma internals.** Prisma exposes no
  stable schema-AST API for test tooling. The surface needed is
  small and regular; a line scanner is simpler and has no version
  coupling.

- **Layer A recognises field-level `@id` / `@unique` on `tenantId`.**
  A singleton config row (BillingAccount, TenantSecuritySettings,
  TaskKeySequence, …) carries `tenantId` as a field-level `@unique` /
  `@id` — which genuinely creates a tenantId-leading index. The check
  uses `leadingIndexedFields`, which sees field-level attributes, so
  those models pass on their real merit. `TENANT_INDEX_EXEMPT` is
  therefore empty: an exemption must mean "no tenant index,
  deliberately" — never "indexed via a mechanism the check missed".

- **Layer B accepts the schema's `[tenantId, fk]` composite
  convention.** The schema deliberately indexes FK columns via
  tenant-scoped composites rather than standalone single-column
  indexes — and for this multi-tenant app, where every query carries
  `tenantId`, that composite IS the correct index. Layer B counts a
  FK that is the second column of a `[tenantId, fk]` composite as
  covered; flagging it would be a guardrail crying wolf. The residual
  80-entry baseline is FKs with genuinely no index support. The 8
  genuine index gaps the layer first surfaced (`R_TODO_INDEX`) were
  closed immediately by migration
  `20260521120000_perf_fk_reverse_lookup_indexes` — the framework's
  first ratchet-down.

- **D1 reports every distinct (method, accessor) per loop**, not just
  the first read — a multi-read loop (e.g. `vendor-audit.ts` freezes
  two entity types) is fully covered. Dedupe is per (method,
  accessor) so a loop reading the same model twice is one finding.

- **D1 keys are `path:method:accessor`, not `path:line`.** Line
  numbers churn on any edit above the loop. The method+accessor pair
  is stable across unrelated edits.

- **D2 is a budget, not a ban.** Many repo methods are legitimately
  unbounded (small reference tables, internal rollups). A hard ban
  would force noise-pragmas everywhere; a one-way-down budget plus a
  slack-drift test keeps the ratchet honest without that noise.
