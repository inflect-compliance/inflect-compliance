# 2026-06-10 — RQ-5 Risk aggregation & hierarchy

**Commit:** `<sha>` feat(risk): risk aggregation & hierarchy (RQ-5)

Tenant-defined org trees (business unit / geography / asset class / custom) with
M:N risk membership and recursive ALE roll-up — executives see where loss
concentrates instead of reading a flat register.

## Design

- **Schema** — `RiskHierarchyNode` (self-referential tree, `@@unique([tenantId,
  type, name])`, parallel trees per `type`) + `RiskHierarchyLink` (M:N risk↔node,
  cascade delete) + RLS on both + migration.
- **`risk-hierarchy.ts`** — `aggregateTree(roots, childrenByParent, riskIdsByNode,
  aleByRisk)` is **pure** and recursive: each subtree collects a **deduped** set
  of risk ids (a risk linked to two children is counted ONCE at the parent), sums
  ALE via RQ-1's `resolveALE`. DB wrappers (`getTreemapData`,
  `aggregateByHierarchy`) load nodes + links + risk ALEs and call it. CRUD +
  link/unlink + `getRiskNodes` (for the risk form).
- **Routes** — `risks/hierarchy` (GET nodes+treemap by type, POST node),
  `[nodeId]` (GET aggregation, PATCH, DELETE), `[nodeId]/links` (POST/DELETE).
- **UI** — `risks/hierarchy` page: type selector, add node, recursive roll-up
  tree with ALE `ProgressBar` share + per-node total + risk count.

## Decisions

- **Dedup at the parent** is the headline correctness property (matrixed risks
  in BU + geography don't inflate the roll-up) — locked by a unit test.
- **N+1-free load** — one `findMany` each for nodes / links / risks, then
  in-memory map assembly + the pure recursion.
- Risk-form hierarchy chips are served by `getRiskNodes`; the visual multi-select
  editor is a follow-up (links are settable via the API today).

## Files

| File | Role |
| --- | --- |
| `usecases/risk-hierarchy.ts` | pure roll-up + CRUD + aggregation. |
| `prisma/schema/compliance.prisma` + migration | two models + RLS. |
| `api/t/[slug]/risks/hierarchy/**` | node CRUD + treemap + links. |
| `risks/hierarchy/page.tsx` | roll-up tree UI. |
