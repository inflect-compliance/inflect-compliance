# 2026-07-18 — Process-canvas compliance half

**Commit:** `<sha>` fix(processes): governance scoping, map lifecycle UI, node-control reverse-lookup + traceability, node badge, cleanups

## Design

Six fixes closing the piecemeal "compliance half" of the process canvas.

1. **Governance scoped honestly (DECISION b).** `governance/page.tsx` graphs
   automation topology (rule counts / success rates / sub-flow calls) with no
   control/risk/asset signal, and included DOCUMENT maps that rendered as dead
   "0 rules / unknown" cards. Rather than build a new compliance-governance
   view, the graph is filtered to `canvasMode: 'AUTOMATION'` (drops the dead
   DOCUMENT cards) and the surface is reframed as **"Automation topology"** —
   honest about what it shows. The raw `canvasMode` enum badge is now localized.

2. **Process-map lifecycle UI.** `setProcessMapStatus` + `deleteProcessMap` +
   the PATCH/DELETE routes existed but nothing called them. `CanvasDocumentBar`
   gains a DRAFT/ACTIVE/ARCHIVED status selector (PATCHes `{status}`, mirroring
   the proven `patchCanvasMode` plumbing) and a delete affordance backed by a
   typed-confirmation modal (`CanvasMapDeleteControl`, the app's canonical
   destructive pattern). The stateful modal lives in its own file so the bar
   stays state-free per the R32 decomposition ratchet.

3. **Template modal clarified (DECISION b).** `TemplateLibraryModal` is
   automation-rule-only but read ambiguously as map-templating. Rather than
   build a process-map starter-template library, its title/description now make
   explicit it authors DRAFT automation rules and does NOT create a canvas map.

4. **Node-linked-control reverse-lookup + per-entity traceability.** A control
   attached via the node-entity picker counted in `coverageSummary` but never
   appeared in the control's reverse-lookup, because `listMapsUsingControl`
   queried only edge controls. It now unions edge (`processEdgeControl`) + node
   (`ProcessNode.linkedEntityId`) placements. And `getControl/Risk/Asset-
   Traceability` now return a `processMaps` placement list, surfaced inline in
   `TraceabilityPanel` ("On process maps") so "sits on map X" isn't shunted
   entirely to a separate modal.

5. **Node-face link badge enriched.** `ProcessTypedNode`'s badge showed only a
   bare `aria-hidden` link icon. It now resolves the linked control/risk/asset
   to its ref·title + live status (mirroring the edge-control pattern), with an
   sr-only kind prefix for screen readers and a graceful fallback while
   loading / archived.

6. **Cleanups.** The stale `ProcessInspector` "one per edge today" comment is
   corrected (the picker is multi). `?activeId` now re-targets on a client-side
   param change (a `useEffect` on the live param, not only the once-run
   initializer) so a second "Where used" deep link while already on /processes
   follows through.

## Decisions

- **Governance + templates: option (b), the honest/bounded scope.** Both "add a
  real compliance view / map-template library" alternatives are larger builds;
  the bounded moves (filter+reframe; clarify copy) remove the dishonesty
  (dead cards / ambiguous modal) without pretending to ship the bigger feature.
- **Reverse-lookup + traceability share one union.** Both surfaces read the same
  edge+node placement union, so the reverse-lookup matches the coverage signal.

## Files

| File | Role |
|------|------|
| `governance-graph-builder.ts` / `governance/page.tsx` | AUTOMATION-only filter, reframe, localized badge |
| `CanvasDocumentBar.tsx` / `CanvasMapDeleteControl.tsx` / `switch-canvas-mode.ts` / `PersistedProcessCanvas.tsx` | status selector + typed-confirm delete |
| `TemplateLibraryModal.tsx` | clarified title/description |
| `usecases/process-map.ts` / `usecases/traceability.ts` | edge+node placement union; `processMaps` in traceability |
| `ControlReverseLookupModal.tsx` / `TraceabilityPanel.tsx` | render unified placements + inline map section |
| `ProcessTypedNode.tsx` | resolved linked-entity badge + a11y |
| `ProcessInspector.tsx` / `ProcessesClient.tsx` | stale comment; live `?activeId` re-target |
