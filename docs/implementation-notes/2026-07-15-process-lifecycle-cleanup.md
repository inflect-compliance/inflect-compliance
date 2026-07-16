# 2026-07-15 — Process-map lifecycle + cleanup (PR-F)

**Commit:** `<pending> chore(processes): process-map lifecycle + cleanup (PR-F)`

## Scope

The long tail after the PR-D (process↔compliance spine) and PR-E (automation
builder) waves: lifecycle affordances, honest scoping of existing surfaces, and
removing dead R25 residue.

## Decisions

- **3.1 — Process-map template library: scoped OUT (decision).** The only
  "template" concept in the processes area is the automation-rule
  `TemplateLibraryModal` (Rules tab), correctly named "Automation Epic 8" — no
  rename needed. Process *maps* are a free-form mapping canvas, not templated
  documents; the blank "New process" create flow is the right primitive. A
  starter-template gallery is a possible future enhancement, not a correctness
  gap, so nothing shipped here for it.

- **3.2 — Delete + status lifecycle.** Backend landed:
  `setProcessMapStatus` usecase + `ProcessMapRepository.setStatus` + the
  `PATCH /processes/[id]` route extended to accept `{ status }`
  (DRAFT/ACTIVE/ARCHIVED), mirroring the existing `canvasMode` switch. Delete
  backend (`deleteProcessMap` + `DELETE` route) already existed. **Remaining
  follow-up:** the document-bar affordances (status Combobox + delete button
  with a typed-confirmation per the destructive-actions convention) — the
  backend is ready to wire; deferred to keep this PR's blast radius bounded and
  because the wiring threads list-refresh state through `PersistedProcessCanvas`
  + `ProcessesClient`.

- **3.3 — Governance graph: honestly scoped (decision + label tighten).** The
  graph builder + page docstrings already describe it accurately as the
  tenant's *automation topology* (maps sized by rule volume, ringed by 30-day
  execution health, sub-flow-call edges) — it does not read controls/risks and
  makes no compliance claim. Tightened the heading + nav label from "Governance
  graph" to "Automation governance graph" / "Automation graph" so the scope is
  explicit in the chrome, not just the description. Making it compliance-aware
  (folding in the PR-D process↔control links) is a larger future direction, not
  a fix.

- **3.4 / 3.5 — Dead R25 residue + stale docs.** Removed the orphaned
  `automation.edges.addControl` + `defaultControlLabel` i18n keys (dead since
  PR-D retired the on-edge stamp). Refreshed `ProcessTypedNode` +
  `node-taxonomy` docstrings: "seven kinds" → 12 (8 document + 4 automation),
  the retired R31 diamond, and the on-edge "Add control" → inspector Control
  picker.

## Files
| File | Role |
| --- | --- |
| `src/app-layer/usecases/process-map.ts` | `setProcessMapStatus` |
| `src/app-layer/repositories/ProcessMapRepository.ts` | `setStatus` |
| `src/app/api/t/[tenantSlug]/processes/[id]/route.ts` | PATCH accepts `status` |
| `src/app/t/[tenantSlug]/(app)/processes/governance/page.tsx` (+ messages) | honest scope label |
| `src/components/processes/{ProcessTypedNode,node-taxonomy}.ts(x)` | stale-doc refresh |
| `messages/{en,bg}.json` | drop dead keys, tighten governance labels |
