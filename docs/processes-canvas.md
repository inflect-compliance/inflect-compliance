# Processes Canvas (Roadmap-25)

A visual-only canvas under **Manage → Processes** for mapping
business and IT processes and placing governance controls on the
connections between process steps. Built on
[`@xyflow/react`](https://github.com/xyflow/xyflow) (already
installed for the traceability `<GraphExplorer>`); IC owns the
visual language via custom node / edge / overlay components.

## Architecture (top → bottom)

| Layer | File | Owns |
|---|---|---|
| Route | `src/app/t/[tenantSlug]/(app)/processes/page.tsx` | Server entry, `force-dynamic`, delegates to client |
| Page client | `.../processes/ProcessesClient.tsx` | `<WorkspaceShell>` mount, dynamic-import boundary (`ssr:false`) for xyflow |
| Shell | `src/components/layout/WorkspaceShell.tsx` | 3-slot canvas-centric shell (Header / Toolbar / Body). Sibling of `<ListPageShell>` / `<EntityDetailLayout>` |
| Canvas | `src/components/processes/ProcessCanvas.tsx` | xyflow `<ReactFlowProvider>` + `<ReactFlow>` wrapped with IC theming + drag-drop wiring |
| Palette | `src/components/processes/ProcessPalette.tsx` | Slim top toolbar, HTML5-draggable process-step stamps. Exports `PALETTE_DRAG_MIME` |
| Custom node | `src/components/processes/ProcessStepNode.tsx` | Memo-wrapped IC-card-style node, L→R handles, brand-emphasis selected ring |
| Custom edge | `src/components/processes/ProcessEdge.tsx` | Memo-wrapped bezier edge with token-backed stroke + `<ControlOnEdge>` overlay |
| Sidebar nav | `src/components/layout/SidebarNav.tsx` | "Process" entry in Manage section, `Workflow` lucide icon |

## Interaction model (R25-PR-E)

Constrained by intent — visual-only authoring:

| Gesture | Result |
|---|---|
| Drag from palette → drop on canvas | Creates a `processStep` node at the drop coordinates (`screenToFlowPosition` accounts for pan + zoom) |
| Drag from node handle → drop on another node handle | Creates a `processEdge` connection |
| Click on edge | Selects the edge; if no control, shows the "+ Add control" affordance at the bezier midpoint |
| Click the affordance | Adds a `<ControlOnEdge>` overlay with default label "Control" |
| Backspace | Deletes the selected node or edge (xyflow default) |
| Trackpad drag / scroll | Pans / zooms (xyflow default) |

## Deliberate non-features

These were considered and **rejected** in scope:

- **Persistence** — canvas state is in-memory only. Future seam:
  serialize nodes + edges + controls to JSON, POST to
  `/api/t/:slug/processes/:id`.
- **Process execution / simulation / engine** — R25 is visual-only.
- **Templates / process library** — out of scope.
- **Inspector / properties panel** — out of scope.
- **Right-click context menus** — locked OUT by the R25-PR-E ratchet
  (`onEdgeContextMenu` may not be wired).
- **Inline label editing for controls** — controls get a default
  label "Control"; renaming is a future expansion.
- **MiniMap + pan/zoom Controls bar** — locked OUT by the R25-PR-F
  ratchet. They read as clutter on a calm surface; trackpad gestures
  carry the interaction.
- **Linking control overlays to actual `Control` rows in the
  database** — future expansion seam: `<ControlOnEdge>` accepts a
  `controlId` prop that fetches the linked control row.
- **Export (PNG / JSON / SVG)** — out of scope.
- **Multi-user / live cursors** — out of scope.

The architecture leaves room for each of these without building
them now.

## xyflow adoption discipline

What's adopted:

- The `<ReactFlow>` canvas + `<ReactFlowProvider>` context
- `<Background variant="dots">` (IC tokens for color)
- `<BaseEdge>` + `getBezierPath` + `<EdgeLabelRenderer>` for custom edges
- `<Handle>` for node connection points
- `useReactFlow().setEdges` / `applyNodeChanges` / `addEdge` helpers
- `screenToFlowPosition` for drop coordinate conversion

What's deliberately rejected:

- `<MiniMap>` — too much chrome on a calm canvas
- `<Controls>` — pan/zoom toolbar adds visual chatter
- `xyflow/system` low-level imports — `@xyflow/react` covers the API
- The xyflow attribution badge — `proOptions={{ hideAttribution: true }}`

## Visual contract

- Canvas background: dot grid at 24px spacing, `var(--border-subtle)` colour
- Process step nodes: IC card recipe, 8px radius (R24 chrome family), brand-emphasis selected ring (matches `<KpiFilterCard>`)
- Edges: bezier, `var(--border-default)` stroke at rest, `var(--brand-default)` selected, 1.5/2 px stroke width
- Control overlays: pill at edge midpoint, `<ShieldCheck>` icon prefix, `border-emphasis` + `bg-bg-elevated`, max-width 120px truncate

## Test layout

| Layer | File | Owns |
|---|---|---|
| Route + shell + nav | `tests/guards/r25-pra-route-and-shell.test.ts` | WorkspaceShell API, page mounts shell, Manage entry |
| Canvas + palette | `tests/guards/r25-prb-canvas-integration.test.ts` | xyflow imports, drag-drop wiring, palette mime |
| Custom node | `tests/guards/r25-prc-process-step-node.test.ts` | Node component + handles + canvas registration |
| Custom edge + overlay | `tests/guards/r25-prd-edge-and-control-overlay.test.ts` | Edge component + EdgeLabelRenderer + node-vs-control distinction |
| Interaction | `tests/guards/r25-pre-interaction-model.test.ts` | Add-control affordance + explicit-absence locks |
| Polish + capstone | `tests/guards/r25-prf-polish-and-capstone.test.ts` | Empty state + restraint (no MiniMap) + meta-lock |

## Adding a new node type

1. Create `src/components/processes/<Name>Node.tsx` with the same
   shape as `<ProcessStepNode>` (memo-wrapped, two handles,
   selected-ring contract).
2. Export a `<NAME>_NODE_TYPE` constant.
3. Add it to `NODE_TYPES` in `ProcessCanvas.tsx`.
4. Add a palette entry in `ProcessPalette.tsx` (currently a
   single-item array; extend with the new entry).
5. Update the canvas `onDrop` to use the right type per palette
   payload (today the drop hard-codes `PROCESS_STEP_NODE_TYPE` —
   extending will require a typed `kind` field in the drag
   payload).
6. Add a per-type ratchet under `tests/guards/`.
