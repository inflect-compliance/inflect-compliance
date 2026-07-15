# 2026-07-15 — Process canvas ↔ compliance spine (PR-D)

**Commit:** `<pending> feat(processes): process↔compliance spine (PR-D)`

## Design

Before this change the process canvas linked to the compliance model in
name only: a control could be "placed" on an edge via an on-edge affordance
that stamped an ephemeral `data.control` label which the save serialiser
never persisted, controls carried no real FK to a `Control`, node links were
invisible, and none of it fed the coverage graph. This PR makes the linkage
real, visible, queryable, and reflected in coverage.

Five moves:

1. **Render the persisted shape.** `ProcessEdge` now renders
   `data.controls` (the shape the inspector picker writes and the serialiser
   round-trips), one pill per control with the control's live name + status
   resolved from the tenant control list. The ephemeral single-click stamp is
   gone — controls are attached via the inspector's real Control picker.

2. **Multi-control edges + real FK.** The inspector picker is multi-select
   (several controls can gate one edge). `ProcessEdgeControl.controlId` is
   flipped to `NOT NULL` with a real FK to `Control` (cascade on delete). The
   serialiser drops any entry lacking a real `controlId`, so a
   control-shaped row with no linkage can never be persisted.

3. **Node links visible + reverse queries.** A `control`/`risk`/`asset`
   node bound to a real entity (`dataJson.linkedEntityId`) shows a link badge.
   `listMapsByLinkedEntity` (+ `listMapsUsingRisk`/`listMapsUsingAsset`
   usecases + `/risks|assets/[id]/process-maps` routes) is the node-mounted
   analogue of the edge-control `listMapsByControl` reverse lookup, surfaced
   as a "Where used" modal on risk + asset detail.

4. **Deep link.** `ProcessesClient` now honours `/processes?activeId=<mapId>`
   (the reverse-lookup rows link here) instead of always opening the first map.

5. **Feed the coverage graph.** `coverageSummary` counts controls embedded in
   an operational process (edge-mounted FK OR node-linked, deduped, counted
   against real controls), surfaced as a "Controls in a process" coverage bar.

## Files

| File | Role |
| --- | --- |
| `src/components/processes/ProcessEdge.tsx` | Render persisted `data.controls`; retire ephemeral singular path |
| `src/components/processes/ProcessInspector.tsx` | Multi-select control picker |
| `src/components/processes/ProcessTypedNode.tsx` | Node linked-entity badge |
| `src/components/processes/ProcessNodeReverseLookupModal.tsx` | Risk/asset "Where used" modal |
| `src/lib/processes/edge-controls.ts` | Serialiser requires a real controlId |
| `prisma/schema/processes.prisma` + migration | `controlId` NOT NULL + FK to Control |
| `src/app-layer/repositories/ProcessMapRepository.ts` | `listMapsByLinkedEntity` |
| `src/app-layer/usecases/process-map.ts` | `listMapsUsingRisk` / `listMapsUsingAsset` |
| `src/app/api/t/[tenantSlug]/{risks,assets}/[id]/process-maps/route.ts` | Reverse-lookup API |
| `src/app-layer/usecases/traceability.ts` | Process coverage dimension |
| `src/app/t/[tenantSlug]/(app)/{risks/[riskId],assets/[id]}/page.tsx` | Wire "Where used" |
| `src/app/t/[tenantSlug]/(app)/{processes/ProcessesClient,coverage/CoverageClient}.tsx` | Deep link + coverage bar |

## Decisions

- **controlId NOT NULL was safe now, not before.** Once the only write path
  is the inspector's real Control picker (which always sets a real id) and the
  serialiser drops null-controlId entries, there is no source of null rows.
  The migration defensively deletes any pre-existing null rows before the
  constraint. The schema comment had reserved exactly this flip.
- **Node-link reverse query filters JSON.** `linkedEntityId` lives in
  `ProcessNode.dataJson`, so the reverse query filters
  `dataJson.path(['linkedEntityId'])`; bounded by the small process-node graph
  (`guardrail-allow: unbounded`). Promoting the link to a real column is a
  larger follow-up.
- **Retargeted the R25 ratchets, not the whole cleanup.** Changing
  `ProcessEdge`'s control shape intrinsically touches the guards that pin that
  shape (`r25-pre-interaction-model`, `r27-prb-graph-elements`), so those
  moved here; the broader dead-R25 sweep stays in PR-F.
- **Process coverage counts real controls only.** A node link could reference
  a since-deleted control, so the count intersects the linked ids with the
  tenant's actual `Control` rows via a bounded `id IN (...)` count.
