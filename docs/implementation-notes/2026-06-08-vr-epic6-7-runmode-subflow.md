# 2026-06-08 — Visual Rule Editor VR-6 + VR-7: Run Mode & Sub-Flows

**Commits:** VR-6 live execution overlay · VR-7 sub-flow nesting

## VR-6 — Live Execution Overlay (Run Mode)

`run-mode-context` (Design ↔ Live) + `canvas-execution-overlay`:
- `buildOverlayMap` — pure reducer over the live-executions endpoint: RUNNING
  wins over a terminal state for the same rule; running rows accumulate a
  concurrency `count`; recent terminal rows fill in just-finished status.
- `CanvasOverlayProvider` — calls the live SWR poll **once** (3s, only while
  Run Mode is on) and distributes the map via context.
- `useNodeOverlayStatus` + `overlayClassFor` — `ProcessTypedNode` paints its
  chassis (pulsing ring / success / error / dim) from the **context**, not a
  per-node hook.

**Key decision — context distribution, not a per-node hook.** The first cut
called `useTenantSWR` inside every `ProcessTypedNode`; that broke standalone
node rendering (no `TenantProvider`) and would have opened N subscriptions.
Computing the map once at the canvas and reading it from context keeps the
node renderer free of tenant/network deps — it still renders in isolation, and
the overlay is simply empty without a provider. The canvas-level provider mount
+ doc-bar Run toggle is the remaining UI wiring.

## VR-7 — Sub-Flow Nesting

- `INVOKE_SUBFLOW` action type + `AutomationRule.subFlowGroupId` (the enclosing
  canvas group's `ProcessNode.nodeKey`) + migration + `[tenantId,subFlowGroupId]`
  index. `InvokeSubflowConfig` Zod schema (`{ targetGroupId }`).
- `subflow-dispatcher` job — resolves the group's entry rule (ENABLED,
  priority-ordered) and runs it as a child execution linked to the invoking
  execution via `parentExecutionId` + `triggeredBy: 'subflow'`. Registered +
  tenant-scoped, mirroring `rule-chain-dispatch`. Not scheduled (enqueued
  on-demand), so the scheduled-job count is unchanged.

**Decisions / deferrals.**
- Entry rule = first ENABLED rule in the group by `(priority desc, createdAt
  asc)` — deterministic; the group's trigger node owns it.
- Action handlers stay stubbed at the foundation level (record intent),
  consistent with the rest of the automation engine.
- `CanvasSubFlowPicker` modal + the inspector "Call Sub-flow" option are
  deferred to the canvas-UI wiring; the backend (action type, schema, job,
  linkage) is complete + tested.
