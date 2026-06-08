# 2026-06-08 — Visual Rule Editor VR-1 + VR-2: Automation Canvas Foundation

**Commit:** `<sha>` feat(processes): VR-1+VR-2 — automation node taxonomy + canvas mode

The low-risk additive foundation for the Visual Rule Editor (the roadmap
explicitly bundles VR-1+VR-2). Establishes the automation node vocabulary and
the DOCUMENT-vs-AUTOMATION canvas mode gate without touching existing process
maps.

## Design

```
node-taxonomy: +trigger/condition/action/slaGate (flow category)
  → AUTOMATION_NODE_ORDER (separate from NODE_TAXONOMY_ORDER so they never
    leak into the DOCUMENT palette)
ProcessMap.canvasMode (ProcessCanvasMode: DOCUMENT|AUTOMATION)
  → CanvasModeProvider (ProcessesClient wraps the canvas with the active
    map's mode) → useIsAutomationMode → ProcessPalette renders an
    "Automation" section only in AUTOMATION mode
```

## Files

| File | Role |
|------|------|
| `src/components/processes/node-taxonomy.ts` | +4 automation kinds, `AUTOMATION_NODE_ORDER`, `isAutomationNodeKind` |
| `src/components/processes/ProcessPalette.tsx` | mode-gated Automation palette section |
| `src/lib/processes/canvas-mode-context.tsx` | NEW — `CanvasModeProvider` / `useCanvasMode` / `useIsAutomationMode` |
| `prisma/schema/{enums,processes}.prisma` + migration | `ProcessCanvasMode` enum + `ProcessMap.canvasMode` |
| `src/app-layer/schemas/process-map.ts` + usecase + `ProcessMapRepository` | `canvasMode` through create + list |
| `src/app/t/[tenantSlug]/(app)/processes/ProcessesClient.tsx` | wraps the canvas in `CanvasModeProvider` from the active map's mode |

## Decisions

- **Automation kinds use a separate `AUTOMATION_NODE_ORDER`, not
  `NODE_TAXONOMY_ORDER`.** This guarantees they never appear in the DOCUMENT
  palette — the palette renders them as a distinct mode-gated section. Keeps
  them category `flow` (per roadmap) so `ProcessTypedNode`'s category-based
  rendering needs no change yet.
- **Mode provided at `ProcessesClient`, not surgically inside
  `PersistedProcessCanvas`.** The page shell owns the active map + renders the
  canvas, so wrapping there gives the deep palette the context for free
  without touching the large canvas component.
- **The visual create-type-picker + document-bar mode toggle are deferred to
  VR-3's PR** (which concentrates the canvas surgery). VR-1+VR-2 ships the
  taxonomy, schema, context, palette gate, and backend `canvasMode` plumbing —
  reachable via the create API; the in-canvas mode switch lands with the sync
  bridge. The roadmap's own note bundles VR-1+VR-2 as the "purely additive,
  no breaking changes" foundation.
- **Updated the `r26-prb-node-taxonomy` ratchet** (canonical kind count
  8→12; document palette order excludes the automation kinds) — the sanctioned
  way to extend the locked taxonomy.
